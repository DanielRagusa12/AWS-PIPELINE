import json
import os
import boto3
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ.get('DYNAMODB_TABLE_NAME', 'NEODailyData'))

HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
}

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return str(obj)
        return super(DecimalEncoder, self).default(obj)

def lambda_handler(event, context):
    fetch_date = (event.get('queryStringParameters') or {}).get('fetch_date')
    if not fetch_date:
        return {
            'statusCode': 400,
            'headers': HEADERS,
            'body': json.dumps({'error': 'fetch_date query parameter is required'})
        }

    try:
        response = table.get_item(Key={'fetch_date': fetch_date})
        if 'Item' in response:
            return {
                'statusCode': 200,
                'headers': HEADERS,
                'body': json.dumps(response['Item'], cls=DecimalEncoder)
            }

        latest_item = get_latest_item()
        if latest_item:
            latest_item['requested_fetch_date'] = fetch_date
            latest_item['fallback_reason'] = 'requested fetch_date was not found'
            return {
                'statusCode': 200,
                'headers': HEADERS,
                'body': json.dumps(latest_item, cls=DecimalEncoder)
            }

        return {
            'statusCode': 404,
            'headers': HEADERS,
            'body': json.dumps({'error': 'Data not found'}, cls=DecimalEncoder)
        }
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': HEADERS,
            'body': json.dumps({'error': str(e)}, cls=DecimalEncoder)
        }

def get_latest_item():
    latest_date = None
    scan_kwargs = {
        'ProjectionExpression': '#fetch_date',
        'ExpressionAttributeNames': {'#fetch_date': 'fetch_date'}
    }

    while True:
        response = table.scan(**scan_kwargs)
        for item in response.get('Items', []):
            item_date = item.get('fetch_date')
            if item_date and (latest_date is None or item_date > latest_date):
                latest_date = item_date

        last_key = response.get('LastEvaluatedKey')
        if not last_key:
            break
        scan_kwargs['ExclusiveStartKey'] = last_key

    if not latest_date:
        return None

    response = table.get_item(Key={'fetch_date': latest_date})
    return response.get('Item')
