import os
import boto3
import json
from datetime import datetime, timezone, date, timedelta
from urllib.error import HTTPError, URLError
from urllib.request import urlopen
from decimal import Decimal, ROUND_HALF_UP

NASA_API_KEY = os.getenv('NASA_API_KEY')
RAW_DATA_BUCKET_NAME = os.getenv('RAW_DATA_BUCKET_NAME', 'neopipeline-raw-data')
DYNAMODB_TABLE_NAME = os.getenv('DYNAMODB_TABLE_NAME', 'NEODailyData')

REFERENCE_OBJECTS = [
    {
        'id': 'statue_of_liberty',
        'name': 'Statue of Liberty',
        'height_m': Decimal('93'),
        'category': 'landmark'
    },
    {
        'id': 'eiffel_tower',
        'name': 'Eiffel Tower',
        'height_m': Decimal('330'),
        'category': 'landmark'
    },
    {
        'id': 'football_field',
        'name': 'American football field',
        'height_m': Decimal('109.73'),
        'category': 'length'
    },
    {
        'id': 'school_bus',
        'name': 'School bus',
        'height_m': Decimal('10.67'),
        'category': 'vehicle_length'
    }
]

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
    return filename

def fetch_nasa_data():
    today = date.today().strftime("%Y-%m-%d")
    url = f'https://api.nasa.gov/neo/rest/v1/feed?start_date={today}&end_date={today}&api_key={NASA_API_KEY}'

    try:
        with urlopen(url, timeout=20) as response:
            return json.loads(response.read().decode('utf-8'))
    except HTTPError as http_err:
        print(f"HTTP error occurred: {http_err}")
    except URLError as err:
        print(f"URL error occurred: {err}")
    except Exception as err:
        print(f"An error occurred: {err}")
    return None

def format_decimal(value):
    return Decimal(value).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

def format_number(num, precision=2):
    return Decimal(str(round(float(num), precision)))

def decimal_ratio(value, divisor, precision=2):
    quantizer = Decimal('1').scaleb(-precision)
    return (value / divisor).quantize(quantizer, rounding=ROUND_HALF_UP)

def serialize_reference_objects():
    return [
        {
            'id': reference['id'],
            'name': reference['name'],
            'height_m': reference['height_m'],
            'category': reference['category']
        }
        for reference in REFERENCE_OBJECTS
    ]

def build_visualization_data(neo_data):
    diameter_min_m = format_number(neo_data['estimated_diameter']['meters']['estimated_diameter_min'], 2)
    diameter_max_m = format_number(neo_data['estimated_diameter']['meters']['estimated_diameter_max'], 2)
    diameter_avg_m = ((diameter_min_m + diameter_max_m) / Decimal('2')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    radius_avg_m = (diameter_avg_m / Decimal('2')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    comparisons = []
    for reference in REFERENCE_OBJECTS:
        comparisons.append({
            'reference_id': reference['id'],
            'reference_name': reference['name'],
            'reference_height_m': reference['height_m'],
            'neo_to_reference_ratio': decimal_ratio(diameter_avg_m, reference['height_m']),
            'reference_to_neo_ratio': decimal_ratio(reference['height_m'], diameter_avg_m)
        })

    closest_reference = min(
        comparisons,
        key=lambda comparison: abs(Decimal('1') - comparison['neo_to_reference_ratio'])
    )

    return {
        'diameter_min_m': diameter_min_m,
        'diameter_max_m': diameter_max_m,
        'diameter_avg_m': diameter_avg_m,
        'radius_avg_m': radius_avg_m,
        'primary_reference_id': 'statue_of_liberty',
        'primary_reference_name': 'Statue of Liberty',
        'primary_reference_height_m': Decimal('93'),
        'primary_reference_ratio': decimal_ratio(diameter_avg_m, Decimal('93')),
        'closest_reference_id': closest_reference['reference_id'],
        'closest_reference_name': closest_reference['reference_name'],
        'comparison_ratios': comparisons,
        'render_shape': 'irregular_sphere'
    }

def clean_large_numbers(neo_data):
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
        'visualization': build_visualization_data(neo_data),
        'is_potentially_hazardous_asteroid': neo_data['is_potentially_hazardous_asteroid'],
        'close_approach_data': neo_data['close_approach_data']
    }

def build_daily_summary(processed_neos):
    if not processed_neos:
        return {
            'neo_count': 0,
            'hazardous_count': 0
        }

    largest_neo = max(processed_neos, key=lambda neo: neo['visualization']['diameter_avg_m'])
    hazardous_count = sum(1 for neo in processed_neos if neo['is_potentially_hazardous_asteroid'])

    return {
        'neo_count': len(processed_neos),
        'hazardous_count': hazardous_count,
        'largest_neo_id': largest_neo['neo_id'],
        'largest_neo_name': largest_neo['name'],
        'largest_neo_diameter_avg_m': largest_neo['visualization']['diameter_avg_m']
    }

def lambda_handler(event, context):
    # Initialize AWS resources
    s3 = boto3.resource('s3')
    dynamodb = boto3.resource('dynamodb')

    # Fetch NASA data
    resJson = fetch_nasa_data()
    if not resJson:
        print("No data fetched from NASA.")
        return {"statusCode": 500, "body": json.dumps("Failed to fetch data from NASA.")}

    # Clear S3 bucket
    bucket_name = RAW_DATA_BUCKET_NAME
    # clear_bucket(bucket_name, s3)

    # Upload data to S3
    raw_s3_key = upload_to_s3(resJson, bucket_name, s3)

    # Aggregate NEO data for the current date
    fetch_date = date.today().strftime("%Y-%m-%d")
    neos = resJson['near_earth_objects'][fetch_date]

     # Calculate expiry date
    expiry_date = int((datetime.now(timezone.utc) + timedelta(days=30)).timestamp())
    print(f"Expiry Date (timestamp): {expiry_date}")
    print(f"Expiry Date (readable): {datetime.fromtimestamp(expiry_date, timezone.utc)}")

    processed_neos = [convert_neo_data_types(neo) for neo in neos]

    # Insert aggregated data into DynamoDB
    aggregated_data = {
        'fetch_date': fetch_date,
        'fetched_at': datetime.now(timezone.utc).isoformat(),
        'raw_s3_bucket': bucket_name,
        'raw_s3_key': raw_s3_key,
        'reference_objects': serialize_reference_objects(),
        'summary': build_daily_summary(processed_neos),
        'neos': processed_neos,
        'expiryDate': expiry_date  # Set TTL 30 days from now
    }

    # Insert aggregated data into DynamoDB
    table = dynamodb.Table(DYNAMODB_TABLE_NAME)
    table.put_item(Item=aggregated_data)
    print(f"Inserted NEO data for date {fetch_date}")

    return {"statusCode": 200, "body": json.dumps("Success")}
