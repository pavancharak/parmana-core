# PRODUCTION API STACK (<ACCOUNT_ID>). Step 3 of the production build.
# Runs the Parmana API on App Runner, in the private subnets, with outbound traffic only to the database.
#
# Two phases:
#   Phase 1 (deploy_service = false): ECR repository, secrets, VPC connector, IAM roles.
#   Phase 2 (deploy_service = true, image_tag set): the App Runner service, after the image is pushed.

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
  type        = string
  default     = "parmana-prod"
  description = "AWS CLI profile for this account, from aws configure sso. Not root credentials."
}

variable "expected_account_id" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "database_security_group_id" {
  type = string
}

variable "deploy_service" {
  type        = bool
  default     = false
  description = "false in phase 1. true in phase 2, once image_tag is pushed to ECR."
}

variable "image_tag" {
  type        = string
  default     = ""
  description = "Tag of the image pushed to the ECR repository, for example a git commit SHA. Required when deploy_service is true."
}

data "aws_caller_identity" "current" {}

check "account_guard" {
  assert {
    condition     = data.aws_caller_identity.current.account_id == var.expected_account_id
    error_message = "Signed in to account ${data.aws_caller_identity.current.account_id}, expected ${var.expected_account_id}. Stop."
  }
}

check "image_tag_set" {
  assert {
    condition     = !var.deploy_service || var.image_tag != ""
    error_message = "deploy_service is true but image_tag is empty. Push the image first, then set image_tag."
  }
}

# The database stack writes this secret. Read it here, so the two stacks stay separate.
data "aws_secretsmanager_secret" "database_url" {
  name = "parmana/${var.environment}/database-url"
}

# ---------- Container registry ----------

resource "aws_ecr_repository" "api" {
  name                 = "parmana-api"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

# ---------- Secrets (values are set by hand, not in code) ----------

# API keys for callers, as a JSON array (PARMANA_API_KEYS).
resource "aws_secretsmanager_secret" "api_keys" {
  name                    = "parmana/${var.environment}/api-keys"
  description             = "PARMANA_API_KEYS JSON array for the production API"
  recovery_window_in_days = 30
}

resource "aws_secretsmanager_secret_version" "api_keys" {
  secret_id     = aws_secretsmanager_secret.api_keys.id
  secret_string = "[]"

  lifecycle {
    ignore_changes = [secret_string]
  }
}

# Signing key material (PARMANA_KEY_MATERIAL_JSON). Set by hand, never in code or the image.
resource "aws_secretsmanager_secret" "key_material" {
  name                    = "parmana/${var.environment}/key-material"
  description             = "PARMANA_KEY_MATERIAL_JSON for the production API"
  recovery_window_in_days = 30
}

resource "aws_secretsmanager_secret_version" "key_material" {
  secret_id     = aws_secretsmanager_secret.key_material.id
  secret_string = "{}"

  lifecycle {
    ignore_changes = [secret_string]
  }
}

# ---------- Network access from App Runner to the database ----------

resource "aws_security_group" "connector" {
  name        = "parmana-${var.environment}-apprunner-connector"
  description = "App Runner VPC connector: outbound PostgreSQL to the database only"
  vpc_id      = var.vpc_id

  egress {
    description     = "PostgreSQL to the database security group"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.database_security_group_id]
  }
}

resource "aws_apprunner_vpc_connector" "api" {
  vpc_connector_name = "parmana-${var.environment}"
  subnets            = var.private_subnet_ids
  security_groups    = [aws_security_group.connector.id]
}

# ---------- IAM ----------

# App Runner uses this role to pull the image from ECR.
resource "aws_iam_role" "apprunner_access" {
  name = "parmana-${var.environment}-apprunner-access"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "build.apprunner.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "apprunner_ecr" {
  role       = aws_iam_role.apprunner_access.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess"
}

# The running API uses this role to read its three secrets, and nothing else.
resource "aws_iam_role" "api_instance" {
  name = "parmana-${var.environment}-api-instance"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "tasks.apprunner.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "api_read_secrets" {
  name = "read-api-secrets"
  role = aws_iam_role.api_instance.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "ReadApiSecretsOnly"
      Effect = "Allow"
      Action = ["secretsmanager:GetSecretValue"]
      Resource = [
        data.aws_secretsmanager_secret.database_url.arn,
        aws_secretsmanager_secret.api_keys.arn,
        aws_secretsmanager_secret.key_material.arn,
      ]
    }]
  })
}

# ---------- Scaling ----------

# Small cap for minimal traffic. Raise max_size when the service needs it.
resource "aws_apprunner_auto_scaling_configuration_version" "api" {
  auto_scaling_configuration_name = "parmana-${var.environment}"
  max_concurrency                 = 50
  min_size                        = 1
  max_size                        = 2
}

# ---------- The service (phase 2 only) ----------

resource "aws_apprunner_service" "api" {
  count        = var.deploy_service ? 1 : 0
  service_name = "parmana-api-${var.environment}"

  source_configuration {
    auto_deployments_enabled = false

    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_access.arn
    }

    image_repository {
      image_repository_type = "ECR"
      image_identifier      = "${aws_ecr_repository.api.repository_url}:${var.image_tag}"

      image_configuration {
        port = "3000"

        runtime_environment_variables = {
          NODE_ENV           = "production"
          PARMANA_STORAGE    = "postgres"
          KEY_PROVIDER       = "local"
          PARMANA_POLICY_DIR = "./policies"
          PARMANA_KEY_DIR    = "./keys"
        }

        runtime_environment_secrets = {
          DATABASE_URL              = data.aws_secretsmanager_secret.database_url.arn
          PARMANA_API_KEYS          = aws_secretsmanager_secret.api_keys.arn
          PARMANA_KEY_MATERIAL_JSON = aws_secretsmanager_secret.key_material.arn
        }
      }
    }
  }

  instance_configuration {
    cpu               = "256"
    memory            = "512"
    instance_role_arn = aws_iam_role.api_instance.arn
  }

  network_configuration {
    egress_configuration {
      egress_type       = "VPC"
      vpc_connector_arn = aws_apprunner_vpc_connector.api.arn
    }

    ingress_configuration {
      is_publicly_accessible = true
    }
  }

  health_check_configuration {
    protocol            = "HTTP"
    path                = "/health"
    interval            = 10
    timeout             = 5
    healthy_threshold   = 1
    unhealthy_threshold = 5
  }

  auto_scaling_configuration_arn = aws_apprunner_auto_scaling_configuration_version.api.arn
}

# ---------- Outputs ----------

output "ecr_repository_url" {
  value = aws_ecr_repository.api.repository_url
}

output "service_url" {
  value = var.deploy_service ? aws_apprunner_service.api[0].service_url : "not deployed yet (phase 1)"
}

output "api_keys_secret_name" {
  value = aws_secretsmanager_secret.api_keys.name
}

output "key_material_secret_name" {
  value = aws_secretsmanager_secret.key_material.name
}
