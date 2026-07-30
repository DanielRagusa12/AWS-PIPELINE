# NEO Visualization

NEO Visualization is an AWS-backed data pipeline and static frontend for exploring near-Earth object close approaches. It fetches NASA NeoWs data every day, stores the raw response, writes a curated dataset to DynamoDB, and serves that data through an API consumed by the frontend.

The frontend visualizes each near-Earth object against familiar vertical references: an average human, the Statue of Liberty, the Eiffel Tower, the Burj Khalifa, and Mount Everest.

Live site: [https://aws-pipeline.vercel.app/](https://aws-pipeline.vercel.app/)

## Architecture

```text
Browser / Static Frontend
        |
        v
API Gateway HTTP API
        |
        v
Lambda: neo-pipeline-api
        |
        v
DynamoDB: NEODailyData

EventBridge Daily Schedule
        |
        v
Lambda: neo-pipeline-daily-fetch
        |----------------> NASA NeoWs API
        |----------------> S3 raw data bucket
        |----------------> DynamoDB: NEODailyData
```

## How It Works

The project has two main paths: a scheduled ingestion path and a request/response API path.

## Scheduled Ingestion

EventBridge runs the daily fetch Lambda on a schedule. That Lambda requests a 7-day near-Earth object feed from NASA NeoWs, starting from the current date.

After fetching the NASA response, the Lambda stores the raw payload in S3. This preserves the original API response separately from the processed application data.

The same Lambda then normalizes the feed into a frontend-friendly record. It calculates average diameter, close approach distance, velocity, days until approach, hazard status, and comparison ratios against supported reference objects. It also ranks objects by size, closest pass, fastest speed, soonest approach, hazard status, and overall visual interest.

The processed daily record is written to DynamoDB using `fetch_date` as the partition key. DynamoDB TTL is enabled through the `expiryDate` field, and raw S3 objects expire after 30 days.

## API Path

The frontend requests NEO data from API Gateway at:

```text
GET /get-neo-data?fetch_date=YYYY-MM-DD
```

API Gateway invokes the API Lambda, which reads from DynamoDB. If the requested `fetch_date` exists, the Lambda returns that record. If the requested date is missing, it falls back to the latest stored record so the frontend does not fail during periods when the current day has not been ingested yet.

When fallback data is returned, the response includes `requested_fetch_date` and `fallback_reason` fields. A `404` is only returned when there is no stored NEO data at all.

## Frontend

The frontend is a static site in `neowebsite/static/`. It renders the current NEO window, summary stats, sortable observation cards, and per-card reference selectors.

The visualization is built with HTML, CSS, SVG, and JavaScript. It does not use Three.js or canvas. Each asteroid card uses seeded CSS variation so objects have different shapes, crater positions, sizes, and animation timing while remaining lightweight to render.

The API provides the available sort options and reference-object metadata. The frontend uses that response to render controls and compare each NEO against supported vertical references.

## Infrastructure

Terraform manages the AWS infrastructure in `terraform/`.

Managed resources include:

- API Gateway HTTP API for `GET /get-neo-data`
- Lambda function for API reads: `neo-pipeline-api`
- Lambda function for daily ingestion: `neo-pipeline-daily-fetch`
- DynamoDB table: `NEODailyData`
- S3 raw data bucket: `neo-pipeline-raw-data-bucket`
- EventBridge daily schedule
- IAM roles and policies for Lambda execution, DynamoDB access, S3 writes, and AWS service invocation

Default AWS region: `us-east-2`
