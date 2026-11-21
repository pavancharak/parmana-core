# TEST ACCOUNT STACK (703759331191). Separate folder and state from infra/parmana-prod-signing, which is production.
# Copy of main.tf. Keep the two in step when main.tf changes.
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

# ---------------------------------------------------------------------------
# Secondary (dilithium3) signing key, read from Secrets Manager by the server
# (PARMANA_SECONDARY_KEY_SECRET_ID). The secret's value is created out of band:
# it is the PEM private key, and must never be written into this file or into
# Terraform state. See docs/developer-portal/security/key-management.md.
# ---------------------------------------------------------------------------

variable "secondary_key_secret_name" {
  type        = string
  description = "Name of the Secrets Manager secret holding the secondary private key as PEM."
}

variable "rotation_role_arn" {
  type        = string
  default     = null
  description = "Optional. The one role allowed to write a new value to the secret (key rotation). Leave null to allow no writer other than the account root."
}

variable "secret_key_admin_arn" {
  type        = string
  description = "ARN of the role or user that administers the secret's KMS key. Not the server role."
}

# A separate KMS key for the secret, so only the server role can decrypt it.
data "aws_iam_policy_document" "secret_kms" {
  statement {
    sid       = "AccountAdministration"
    effect    = "Allow"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }

  statement {
    sid       = "SecretKeyAdministration"
    effect    = "Allow"
    actions   = ["kms:Create*", "kms:Describe*", "kms:Enable*", "kms:List*", "kms:Put*", "kms:Update*", "kms:Revoke*", "kms:Disable*", "kms:Get*", "kms:Delete*", "kms:ScheduleKeyDeletion", "kms:CancelKeyDeletion", "kms:TagResource", "kms:UntagResource"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = [var.secret_key_admin_arn]
    }
  }

  statement {
    sid       = "ServerRoleDecryptOnly"
    effect    = "Allow"
    actions   = ["kms:Decrypt", "kms:DescribeKey"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = [data.aws_iam_role.server.arn]
    }
  }
}

data "aws_caller_identity" "current" {}

data "aws_iam_role" "server" {
  name = var.server_role_name
}

resource "aws_kms_key" "secondary_secret" {
  description             = "Parmana ${var.environment} secondary signing key secret"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = data.aws_iam_policy_document.secret_kms.json
}

resource "aws_secretsmanager_secret" "secondary" {
  name        = var.secondary_key_secret_name
  kms_key_id  = aws_kms_key.secondary_secret.arn
  description = "Parmana ${var.environment} dilithium3 private key (PEM). Read only by the server role."
}

# Resource policy: only the server role may read the secret. Everyone else is denied,
# including the account root, so a broad IAM grant elsewhere cannot read it. The rotation role
# (if set) may write a new value, and nothing else.
data "aws_iam_policy_document" "secret_resource" {
  statement {
    sid       = "DenyAllButServerRole"
    effect    = "Deny"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = ["*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "ArnNotEquals"
      variable = "aws:PrincipalArn"
      values   = [data.aws_iam_role.server.arn]
    }
  }

  statement {
    sid       = "ServerRoleReadOnly"
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = [data.aws_iam_role.server.arn]
    }
  }

  # Rotation: the one optional writer. It can write a new value and read its description, and
  # it is still denied GetSecretValue by the statement above.
  dynamic "statement" {
    for_each = var.rotation_role_arn == null ? [] : [var.rotation_role_arn]
    content {
      sid       = "RotationRoleWriteOnly"
      effect    = "Allow"
      actions   = ["secretsmanager:PutSecretValue", "secretsmanager:DescribeSecret"]
      resources = ["*"]
      principals {
        type        = "AWS"
        identifiers = [statement.value]
      }
    }
  }
}

resource "aws_secretsmanager_secret_policy" "secondary" {
  secret_arn = aws_secretsmanager_secret.secondary.arn
  policy     = data.aws_iam_policy_document.secret_resource.json
}

# The server role may read that one secret, and decrypt it with its key. Nothing else.
data "aws_iam_policy_document" "runtime_secret" {
  statement {
    sid       = "ParmanaSecondaryKeyRead"
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
    resources = [aws_secretsmanager_secret.secondary.arn]
  }

  statement {
    sid       = "ParmanaSecondaryKeyDecrypt"
    effect    = "Allow"
    actions   = ["kms:Decrypt"]
    resources = [aws_kms_key.secondary_secret.arn]
  }
}

resource "aws_iam_role_policy" "runtime_secret" {
  name   = "parmana-${var.environment}-secondary-key-read"
  role   = var.server_role_name
  policy = data.aws_iam_policy_document.runtime_secret.json
}

output "parmana_signing_key_id" {
  description = "Value for PARMANA_SIGNING_KEY_ID in this environment."
  value       = aws_kms_alias.signing.name
}
