locals {
  daily_fetch_function_name = "${var.project_name}-daily-fetch"
  api_function_name         = "${var.project_name}-api"
  raw_data_bucket_name      = coalesce(var.raw_data_bucket_name, "${var.project_name}-raw-data-${data.aws_caller_identity.current.account_id}")
  common_tags = {
    Project   = var.project_name
    ManagedBy = "terraform"
  }
}

data "aws_caller_identity" "current" {}

data "archive_file" "daily_fetch" {
  type        = "zip"
  source_file = "${path.module}/../lambda/lambdaDailyFetch/lambdaDailyFetch.py"
  output_path = "${path.module}/lambdaDailyFetch.zip"
}

data "archive_file" "api" {
  type        = "zip"
  source_file = "${path.module}/../lambda/lambdaAPI.py"
  output_path = "${path.module}/lambdaAPI.zip"
}

resource "aws_s3_bucket" "raw_data" {
  bucket = local.raw_data_bucket_name

  tags = local.common_tags
}

resource "aws_s3_bucket_public_access_block" "raw_data" {
  bucket = aws_s3_bucket.raw_data.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "raw_data" {
  bucket = aws_s3_bucket.raw_data.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "raw_data" {
  bucket = aws_s3_bucket.raw_data.id

  rule {
    id     = "expire-raw-neo-data"
    status = "Enabled"

    filter {
      prefix = ""
    }

    expiration {
      days = 30
    }
  }
}

resource "aws_dynamodb_table" "neo_daily_data" {
  name         = var.dynamodb_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "fetch_date"

  attribute {
    name = "fetch_date"
    type = "S"
  }

  ttl {
    attribute_name = "expiryDate"
    enabled        = true
  }

  tags = local.common_tags
}

data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "daily_fetch_lambda" {
  name               = "${local.daily_fetch_function_name}-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json

  tags = local.common_tags
}

resource "aws_iam_role" "api_lambda" {
  name               = "${local.api_function_name}-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "daily_fetch_logs" {
  role       = aws_iam_role.daily_fetch_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "api_logs" {
  role       = aws_iam_role.api_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "daily_fetch_permissions" {
  statement {
    actions = [
      "s3:PutObject"
    ]

    resources = ["${aws_s3_bucket.raw_data.arn}/*"]
  }

  statement {
    actions = [
      "dynamodb:PutItem"
    ]

    resources = [aws_dynamodb_table.neo_daily_data.arn]
  }
}

resource "aws_iam_role_policy" "daily_fetch_permissions" {
  name   = "${local.daily_fetch_function_name}-permissions"
  role   = aws_iam_role.daily_fetch_lambda.id
  policy = data.aws_iam_policy_document.daily_fetch_permissions.json
}

data "aws_iam_policy_document" "api_permissions" {
  statement {
    actions = [
      "dynamodb:GetItem",
      "dynamodb:Scan"
    ]

    resources = [aws_dynamodb_table.neo_daily_data.arn]
  }
}

resource "aws_iam_role_policy" "api_permissions" {
  name   = "${local.api_function_name}-permissions"
  role   = aws_iam_role.api_lambda.id
  policy = data.aws_iam_policy_document.api_permissions.json
}

resource "aws_lambda_function" "daily_fetch" {
  function_name    = local.daily_fetch_function_name
  role             = aws_iam_role.daily_fetch_lambda.arn
  handler          = "lambdaDailyFetch.lambda_handler"
  runtime          = var.lambda_runtime
  filename         = data.archive_file.daily_fetch.output_path
  source_code_hash = data.archive_file.daily_fetch.output_base64sha256
  timeout          = 60

  environment {
    variables = {
      NASA_API_KEY         = var.nasa_api_key
      RAW_DATA_BUCKET_NAME = aws_s3_bucket.raw_data.bucket
      DYNAMODB_TABLE_NAME  = aws_dynamodb_table.neo_daily_data.name
      FEED_WINDOW_DAYS     = tostring(var.feed_window_days)
      MAX_RETURNED_NEOS    = tostring(var.max_returned_neos)
    }
  }

  tags = local.common_tags
}

resource "aws_lambda_function" "api" {
  function_name    = local.api_function_name
  role             = aws_iam_role.api_lambda.arn
  handler          = "lambdaAPI.lambda_handler"
  runtime          = var.lambda_runtime
  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256
  timeout          = 15

  environment {
    variables = {
      DYNAMODB_TABLE_NAME = aws_dynamodb_table.neo_daily_data.name
    }
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_event_rule" "daily_fetch" {
  name                = "${local.daily_fetch_function_name}-schedule"
  description         = "Runs the NEO data fetch Lambda on a schedule."
  schedule_expression = var.daily_fetch_schedule_expression

  tags = local.common_tags
}

resource "aws_cloudwatch_event_target" "daily_fetch" {
  rule      = aws_cloudwatch_event_rule.daily_fetch.name
  target_id = local.daily_fetch_function_name
  arn       = aws_lambda_function.daily_fetch.arn
}

resource "aws_lambda_permission" "allow_eventbridge_daily_fetch" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.daily_fetch.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.daily_fetch.arn
}

resource "aws_apigatewayv2_api" "api" {
  name          = "${var.project_name}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_headers = ["Content-Type"]
    allow_methods = ["GET", "OPTIONS"]
    allow_origins = ["*"]
  }

  tags = local.common_tags
}

resource "aws_apigatewayv2_integration" "api_lambda" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "get_neo_data" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /get-neo-data"
  target    = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true

  tags = local.common_tags
}

resource "aws_lambda_permission" "allow_apigateway_api" {
  statement_id  = "AllowExecutionFromApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "arn:aws:execute-api:${var.aws_region}:${data.aws_caller_identity.current.account_id}:${aws_apigatewayv2_api.api.id}/*/*/get-neo-data"
}
