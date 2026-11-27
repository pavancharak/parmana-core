# PRODUCTION IMAGE BUILD STACK (<ACCOUNT_ID>). Builds the API image in AWS with CodeBuild,
# so no Docker login is needed on a developer machine. Pushes to the parmana-api ECR repository.
#
# Source: a zip of the repo, uploaded by hand to the private source bucket (see README).

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

provider "aws" {
  region  = var.region
  profile = var.aws_profile

  default_tags {
    tags = {
      project     = "parmana"
      environment = var.environment
      managed-by  = "terraform"
    }
  }
}

variable "region" {
  type    = string
  default = "ap-south-1"
}

variable "environment" {
  type    = string
  default = "prod"
}

variable "aws_profile" {
  type    = string
  default = "parmana-prod"
}

variable "expected_account_id" {
  type = string
}

data "aws_caller_identity" "current" {}

check "account_guard" {
  assert {
    condition     = data.aws_caller_identity.current.account_id == var.expected_account_id
    error_message = "Signed in to account ${data.aws_caller_identity.current.account_id}, expected ${var.expected_account_id}. Stop."
  }
}

data "aws_ecr_repository" "api" {
  name = "parmana-api"
}

# ---------- Source bucket ----------

resource "aws_s3_bucket" "source" {
  bucket = "parmana-${var.environment}-build-source-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_public_access_block" "source" {
  bucket                  = aws_s3_bucket.source.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "source" {
  bucket = aws_s3_bucket.source.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "source" {
  bucket = aws_s3_bucket.source.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "source" {
  bucket = aws_s3_bucket.source.id

  rule {
    id     = "expire-old-source"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

# ---------- Logs ----------

resource "aws_cloudwatch_log_group" "build" {
  name              = "/aws/codebuild/parmana-api-${var.environment}"
  retention_in_days = 30
}

# ---------- Build role ----------

resource "aws_iam_role" "build" {
  name = "parmana-${var.environment}-api-build"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "codebuild.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "build" {
  name = "build-and-push"
  role = aws_iam_role.build.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "EcrLogin"
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Sid    = "PushApiImage"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:CompleteLayerUpload",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart",
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer",
        ]
        Resource = data.aws_ecr_repository.api.arn
      },
      {
        Sid      = "ReadSource"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:GetObjectVersion"]
        Resource = "${aws_s3_bucket.source.arn}/*"
      },
      {
        Sid      = "WriteBuildLogs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.build.arn}:*"
      },
    ]
  })
}

# ---------- The build project ----------

resource "aws_codebuild_project" "api" {
  name          = "parmana-api-${var.environment}"
  description   = "Builds the Parmana API image from the source zip and pushes it to ECR"
  service_role  = aws_iam_role.build.arn
  build_timeout = 30

  source {
    type      = "S3"
    location  = "${aws_s3_bucket.source.bucket}/source.zip"
    buildspec = <<-BUILDSPEC
      version: 0.2
      phases:
        pre_build:
          commands:
            - test -n "$IMAGE_TAG" || (echo "IMAGE_TAG must be set when starting the build" && exit 1)
            - aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $REPO_HOST
        build:
          commands:
            - docker build -t "$REPO_URL:$IMAGE_TAG" .
        post_build:
          commands:
            - docker push "$REPO_URL:$IMAGE_TAG"
            - echo "Pushed $REPO_URL:$IMAGE_TAG"
    BUILDSPEC
  }

  artifacts {
    type = "NO_ARTIFACTS"
  }

  environment {
    compute_type                = "BUILD_GENERAL1_SMALL"
    image                       = "aws/codebuild/standard:7.0"
    type                        = "LINUX_CONTAINER"
    image_pull_credentials_type = "CODEBUILD"
    privileged_mode             = true

    environment_variable {
      name  = "REPO_URL"
      value = data.aws_ecr_repository.api.repository_url
    }

    environment_variable {
      name  = "REPO_HOST"
      value = split("/", data.aws_ecr_repository.api.repository_url)[0]
    }
  }

  logs_config {
    cloudwatch_logs {
      group_name = aws_cloudwatch_log_group.build.name
    }
  }
}

output "source_bucket" {
  value = aws_s3_bucket.source.bucket
}

output "build_project" {
  value = aws_codebuild_project.api.name
}
