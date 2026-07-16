variable "aws_region" {
  description = "AWS region for all resources."
  type        = string
  default     = "us-east-2"
}

variable "aws_profile" {
  description = "Local AWS CLI profile Terraform should use."
  type        = string
  default     = "Daniel"
}

variable "project_name" {
  description = "Prefix used for resource names."
  type        = string
  default     = "neo-pipeline"
}

variable "raw_data_bucket_name" {
  description = "Globally unique S3 bucket name for raw NASA API responses. Defaults to a project/account-specific name when null."
  type        = string
  default     = "neo-pipeline-raw-data-bucket"
}

variable "dynamodb_table_name" {
  description = "DynamoDB table name for processed NEO data."
  type        = string
  default     = "NEODailyData"
}

variable "nasa_api_key" {
  description = "NASA API key used by the daily fetch Lambda."
  type        = string
  sensitive   = true
}

variable "daily_fetch_schedule_expression" {
  description = "EventBridge schedule expression for the daily fetch Lambda."
  type        = string
  default     = "cron(15 8 * * ? *)"
}

variable "lambda_runtime" {
  description = "Python Lambda runtime."
  type        = string
  default     = "python3.12"
}
