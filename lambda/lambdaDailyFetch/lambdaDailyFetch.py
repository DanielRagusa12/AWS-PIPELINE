import os
import boto3
import json
from datetime import datetime, timezone, date, timedelta
import requests
from decimal import Decimal, ROUND_HALF_UP

# Environment variables directly from AWS Lambda
NASA_API_KEY = os.getenv('NASA_API_KEY')
ACCESS_KEY = os.getenv('ACCESS_KEY')
SECRET_ACCESS_KEY = os.getenv('SECRET_ACCESS_KEY')

def create_dynamodb_table(dynamodb):
    table_name = 'NEODailyData'
    key_schema = [
        {'AttributeName': 'fetch_date', 'KeyType': 'HASH'},  # Partition key
    ]
    attribute_definitions = [
        {'AttributeName': 'fetch_date', 'AttributeType': 'S'}
    ]
    provisioned_throughput = {
        'ReadCapacityUnits': 5,
        'WriteCapacityUnits': 5
    }

    try:
        table = dynamodb.Table(table_name)
        table.load()  # This will throw an exception if the table does not exist
        print(f"Table {table_name} already exists.")
    except dynamodb.meta.client.exceptions.ResourceNotFoundException:
        try:
            table = dynamodb.create_table(
                TableName=table_name,
                KeySchema=key_schema,
                AttributeDefinitions=attribute_definitions,
                ProvisionedThroughput=provisioned_throughput
            )
            # Wait for the table to be created
            table.meta.client.get_waiter('table_exists').wait(TableName=table_name)
            print(f"Table {table_name} created successfully.")
        except Exception as e:
            print(f"Error creating table {table_name}: {e}")

def clear_bucket(bucket_name, s3):
    bucket = s3.Bucket(bucket_name)
    objects_to_delete = [{'Key': obj.key} for obj in bucket.objects.all()]
    if objects_to_delete:
        bucket.delete_objects(Delete={'Objects': objects_to_delete})
        print(f"Cleared all objects from S3 bucket {bucket_name}.")
    else:
        print(f"S3 bucket {bucket_name} is already empty.")

def upload_to_s3(data, bucket_name, s3):
    filename = f"NEO-Data{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}.json"
    data_json = json.dumps(data, default=str)
    s3.Object(bucket_name, filename).put(Body=data_json)
    print(f"Uploaded {filename} to S3 bucket {bucket_name}.")

def fetch_nasa_data():
    try:
        response = requests.get(f'https://api.nasa.gov/neo/rest/v1/feed?start_date={date.today().strftime("%Y-%m-%d")}&end_date={date.today().strftime("%Y-%m-%d")}&api_key={NASA_API_KEY}')
        response.raise_for_status()
        return response.json()
    except requests.exceptions.HTTPError as http_err:
        print(f"HTTP error occurred: {http_err}")
    except Exception as err:
        print(f"An error occurred: {err}")
    return None

def format_decimal(value):
    return Decimal(value).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

def clean_large_numbers(neo_data):
    def format_number(num, precision=2):
        return Decimal(str(round(float(num), precision)))  # Convert to float, then round, then to Decimal

    # Clean up absolute magnitude
    neo_data['absolute_magnitude_h'] = format_number(neo_data['absolute_magnitude_h'], 2)

    # Clean up estimated diameters with 2 decimal places
    for unit in ['kilometers', 'meters', 'miles', 'feet']:
        neo_data['estimated_diameter'][unit]['estimated_diameter_min'] = format_number(neo_data['estimated_diameter'][unit]['estimated_diameter_min'], 2)
        neo_data['estimated_diameter'][unit]['estimated_diameter_max'] = format_number(neo_data['estimated_diameter'][unit]['estimated_diameter_max'], 2)

    # Clean up close approach data with specific precision
    for approach_data in neo_data['close_approach_data']:
        approach_data['relative_velocity']['kilometers_per_second'] = format_number(approach_data['relative_velocity']['kilometers_per_second'], 5)
        approach_data['relative_velocity']['kilometers_per_hour'] = format_number(approach_data['relative_velocity']['kilometers_per_hour'], 2)
        approach_data['relative_velocity']['miles_per_hour'] = format_number(approach_data['relative_velocity']['miles_per_hour'], 2)
        approach_data['miss_distance']['astronomical'] = format_number(approach_data['miss_distance']['astronomical'], 8)
        approach_data['miss_distance']['lunar'] = format_number(approach_data['miss_distance']['lunar'], 2)
        approach_data['miss_distance']['kilometers'] = format_number(approach_data['miss_distance']['kilometers'], 2)
        approach_data['miss_distance']['miles'] = format_number(approach_data['miss_distance']['miles'], 2)

    return neo_data

def convert_neo_data_types(neo_data):
    neo_data = clean_large_numbers(neo_data)
    return {
        'neo_id': neo_data['id'],
        'name': neo_data['name'],
        'nasa_jpl_url': neo_data['nasa_jpl_url'],
        'absolute_magnitude_h': neo_data['absolute_magnitude_h'],
        'estimated_diameter': neo_data['estimated_diameter'],
        'is_potentially_hazardous_asteroid': neo_data['is_potentially_hazardous_asteroid'],
        'close_approach_data': neo_data['close_approach_data']
    }

def lambda_handler(event, context):
    # Initialize AWS resources
    s3 = boto3.resource(
        's3',
        aws_access_key_id=ACCESS_KEY,
        aws_secret_access_key=SECRET_ACCESS_KEY,
        region_name='us-east-2'
    )
    dynamodb = boto3.resource(
        'dynamodb',
        aws_access_key_id=ACCESS_KEY,
        aws_secret_access_key=SECRET_ACCESS_KEY,
        region_name='us-east-2'
    )

    # Fetch NASA data
    resJson = fetch_nasa_data()
    if not resJson:
        print("No data fetched from NASA.")
        return {"statusCode": 500, "body": json.dumps("Failed to fetch data from NASA.")}

    # Clear S3 bucket
    bucket_name = 'neopipeline-raw-data'
    # clear_bucket(bucket_name, s3)

    # Upload data to S3
    upload_to_s3(resJson, bucket_name, s3)

    # Create DynamoDB table if not exists
    create_dynamodb_table(dynamodb)

    # Aggregate NEO data for the current date
    fetch_date = date.today().strftime("%Y-%m-%d")
    neos = resJson['near_earth_objects'][fetch_date]

     # Calculate expiry date
    expiry_date = int((datetime.now(timezone.utc) + timedelta(days=30)).timestamp())
    print(f"Expiry Date (timestamp): {expiry_date}")
    print(f"Expiry Date (readable): {datetime.fromtimestamp(expiry_date, timezone.utc)}")

    # Insert aggregated data into DynamoDB
    aggregated_data = {
        'fetch_date': fetch_date,
        'neos': [convert_neo_data_types(neo) for neo in neos],
        'expiryDate': expiry_date  # Set TTL 30 days from now
    }

    # Insert aggregated data into DynamoDB
    table = dynamodb.Table('NEODailyData')
    table.put_item(Item=aggregated_data)
    print(f"Inserted NEO data for date {fetch_date}")

    return {"statusCode": 200, "body": json.dumps("Success")}
