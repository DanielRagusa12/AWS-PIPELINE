locals {
  website_root  = "${path.module}/../neowebsite/static"
  website_files = fileset(local.website_root, "**")
  website_content_types = {
    css         = "text/css; charset=utf-8"
    html        = "text/html; charset=utf-8"
    ico         = "image/x-icon"
    jpg         = "image/jpeg"
    jpeg        = "image/jpeg"
    js          = "application/javascript; charset=utf-8"
    json        = "application/json; charset=utf-8"
    png         = "image/png"
    webmanifest = "application/manifest+json"
  }
}

resource "aws_s3_bucket" "website" {
  bucket = local.website_bucket_name

  tags = local.common_tags
}

resource "aws_s3_bucket_public_access_block" "website" {
  bucket = aws_s3_bucket.website.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "website" {
  bucket = aws_s3_bucket.website.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "website" {
  bucket = aws_s3_bucket.website.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_cloudfront_origin_access_control" "website" {
  name                              = "${var.project_name}-website-oac"
  description                       = "Restricts the private website bucket to CloudFront."
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "website" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${var.project_name} recruiter-facing static website"
  default_root_object = "index.html"
  http_version        = "http2and3"
  # Flat-rate plans use global edge delivery and manage the attached WAF.
  price_class = "PriceClass_All"

  lifecycle {
    ignore_changes = [web_acl_id]
  }

  origin {
    domain_name              = aws_s3_bucket.website.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.website.id
    origin_id                = "website-s3-origin"
  }

  default_cache_behavior {
    allowed_methods = ["GET", "HEAD", "OPTIONS"]
    cached_methods  = ["GET", "HEAD"]
    # AWS-managed CachingOptimized policy. Flat-rate plans do not accept
    # customer-managed cache policies; object Cache-Control metadata still
    # supplies the site's 5-minute and asset 24-hour freshness periods.
    cache_policy_id        = "658327ea-f89d-4fab-a63d-7e88639e58f6"
    compress               = true
    target_origin_id       = "website-s3-origin"
    viewer_protocol_policy = "redirect-to-https"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = local.common_tags
}

data "aws_iam_policy_document" "website_cloudfront" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.website.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.website.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "website" {
  bucket = aws_s3_bucket.website.id
  policy = data.aws_iam_policy_document.website_cloudfront.json
}

resource "aws_s3_object" "website" {
  for_each = local.website_files

  bucket                 = aws_s3_bucket.website.id
  key                    = each.value
  source                 = "${local.website_root}/${each.value}"
  source_hash            = filemd5("${local.website_root}/${each.value}")
  content_type           = lookup(local.website_content_types, lower(element(reverse(split(".", each.value)), 0)), "application/octet-stream")
  cache_control          = startswith(each.value, "assets/") ? "public,max-age=86400" : "public,max-age=300"
  server_side_encryption = "AES256"

  depends_on = [aws_s3_bucket_server_side_encryption_configuration.website]
}
