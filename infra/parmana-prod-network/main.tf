# PRODUCTION NETWORK STACK (<ACCOUNT_ID>, Parmana account). Step 1 of the production rebuild.
# Separate folder and state from infra/parmana-test-network and infra/parmana-prod-signing.
# Not applied yet. Plan only after the test account inventory has been reviewed.

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
  type        = string
  description = "The one AWS account this stack may run in. Plan and apply fail in any other account."
}

variable "vpc_cidr" {
  type    = string
  default = "10.30.0.0/16"
}

# Fails at plan time if the credentials point at a different account.
data "aws_caller_identity" "current" {}

check "account_guard" {
  assert {
    condition     = data.aws_caller_identity.current.account_id == var.expected_account_id
    error_message = "Signed in to account ${data.aws_caller_identity.current.account_id}, expected ${var.expected_account_id}. Stop."
  }
}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  # Two AZs. RDS needs a subnet group across at least two.
  azs = slice(data.aws_availability_zones.available.names, 0, 2)
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "parmana-${var.environment}" }
}

# Private subnets only. The database and the API both live here.
# No internet gateway and no NAT gateway: NAT is the largest hidden cost for a small
# environment, and the API reaches AWS services through VPC endpoints instead (added in a later step).
resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 1)
  availability_zone = local.azs[count.index]

  tags = { Name = "parmana-${var.environment}-private-${count.index + 1}" }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  tags = { Name = "parmana-${var.environment}-private" }
}

resource "aws_route_table_association" "private" {
  count          = 2
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# Lock the default security group down so nothing uses it by accident.
resource "aws_default_security_group" "default" {
  vpc_id = aws_vpc.main.id

  # No ingress or egress rules.
}

# Database access: only from inside the VPC, on the PostgreSQL port.
resource "aws_security_group" "database" {
  name        = "parmana-${var.environment}-database"
  description = "PostgreSQL access from inside the VPC only"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "PostgreSQL from VPC"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    description = "Replies within the VPC only"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = [var.vpc_cidr]
  }
}

output "vpc_id" {
  value = aws_vpc.main.id
}

output "private_subnet_ids" {
  value = aws_subnet.private[*].id
}

output "database_security_group_id" {
  value = aws_security_group.database.id
}
