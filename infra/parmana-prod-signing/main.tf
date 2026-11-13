# Per-environment Parmana signing alias and runtime policy.
#
# The KMS key itself is created by create-signing-key.ps1, because the AWS
# Terraform provider does not accept the ECC_NIST_EDWARDS25519 key spec.
# Terraform manages the alias and the server role's permissions for that key.
# Draft for review. Not applied. Run terraform validate and plan first.

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

provider "aws" {
  region = var.region
}

variable "region" {
  type    = string
  default = "ap-south-1"
}

variable "environment" {
  type        = string
  description = "Environment name, for example prod or staging."
}

variable "signing_key_arn" {
  type        = string
  description = "ARN of the signing key created by create-signing-key.ps1."
}

variable "server_role_name" {
  type        = string
  description = "Name of the IAM role the Parmana server assumes in this environment (not the ARN)."
}

locals {
  # Key ARN form: arn:aws:kms:<region>:<account>:key/<key-id>
  signing_key_id = element(split("/", var.signing_key_arn), 1)
}

resource "aws_kms_alias" "signing" {
  name          = "alias/parmana-${var.environment}"
  target_key_id = local.signing_key_id
}

# Runtime permissions: sign and read the public key, nothing else.
data "aws_iam_policy_document" "runtime" {
  statement {
    sid       = "ParmanaSigningOnly"
    effect    = "Allow"
    actions   = ["kms:Sign", "kms:GetPublicKey", "kms:DescribeKey"]
    resources = [var.signing_key_arn]
  }
}

resource "aws_iam_role_policy" "runtime" {
  name   = "parmana-${var.environment}-kms-signing"
  role   = var.server_role_name
  policy = data.aws_iam_policy_document.runtime.json
}

output "parmana_signing_key_id" {
  description = "Value for PARMANA_SIGNING_KEY_ID in this environment."
  value       = aws_kms_alias.signing.name
}
