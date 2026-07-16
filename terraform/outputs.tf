output "api_base_url" {
  description = "Base URL for the HTTP API Gateway."
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "get_neo_data_url" {
  description = "Frontend endpoint for fetching NEO data."
  value       = "${trimsuffix(aws_apigatewayv2_stage.default.invoke_url, "/")}/get-neo-data"
}

output "daily_fetch_lambda_name" {
  description = "Daily fetch Lambda function name."
  value       = aws_lambda_function.daily_fetch.function_name
}

output "api_lambda_name" {
  description = "API Lambda function name."
  value       = aws_lambda_function.api.function_name
}

output "dynamodb_table_name" {
  description = "DynamoDB table name."
  value       = aws_dynamodb_table.neo_daily_data.name
}

output "raw_data_bucket_name" {
  description = "Raw data S3 bucket name."
  value       = aws_s3_bucket.raw_data.bucket
}
