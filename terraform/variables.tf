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

variable "website_bucket_name" {
  description = "Globally unique private S3 bucket name for the CloudFront website. Defaults to a project/account-specific name when null."
  type        = string
  default     = null
}

variable "public_data_key" {
  description = "Object key used by the daily Lambda to publish the latest curated frontend dataset."
  type        = string
  default     = "data/latest.json"
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

variable "feed_window_days" {
  description = "Number of days after today to include in the NASA NeoWs feed query."
  type        = number
  default     = 7
}

variable "max_returned_neos" {
  description = "Maximum number of curated NEOs returned to the frontend."
  type        = number
  default     = 50
}

variable "lambda_runtime" {
  description = "Python Lambda runtime."
  type        = string
  default     = "python3.12"
}

variable "budget_alert_email" {
  description = "Email address that receives AWS Budget notifications. Supply through TF_VAR_budget_alert_email; do not commit a real value."
  type        = string
  sensitive   = true
  default     = null
  nullable    = true

  validation {
    condition     = var.budget_alert_email == null || can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.budget_alert_email))
    error_message = "budget_alert_email must be a valid email address."
  }
}
