output "daily_fetch_lambda_name" {
  description = "Daily fetch Lambda function name."
  value       = aws_lambda_function.daily_fetch.function_name
}

output "dynamodb_table_name" {
  description = "DynamoDB table name."
  value       = aws_dynamodb_table.neo_daily_data.name
}

output "raw_data_bucket_name" {
  description = "Raw data S3 bucket name."
  value       = aws_s3_bucket.raw_data.bucket
}

output "website_url" {
  description = "Recruiter-facing CloudFront website URL."
  value       = "https://${aws_cloudfront_distribution.website.domain_name}"
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID for the website."
  value       = aws_cloudfront_distribution.website.id
}

output "website_bucket_name" {
  description = "Private S3 bucket containing the static website and latest public dataset."
  value       = aws_s3_bucket.website.bucket
}
