#!/usr/bin/env python3
"""Print which AWS account and principal the current credentials belong to.

Read-only. It calls STS GetCallerIdentity, which needs no permissions and changes nothing.
It prints the account ID and the ARN only. It never prints the access key, the secret or the
session token. Standard library only, so no install is needed.

Usage (from the repository root):

    python3 scripts/aws-identity-check.py

Reads AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, optionally AWS_SESSION_TOKEN and AWS_REGION.
"""

from __future__ import annotations

import datetime
import hashlib
import hmac
import os
import re
import sys
import urllib.error
import urllib.request

STS_HOST = "sts.amazonaws.com"
BODY = "Action=GetCallerIdentity&Version=2011-06-15"


def _hmac(key: bytes, message: str) -> bytes:
    return hmac.new(key, message.encode(), hashlib.sha256).digest()


def _signed_request(access_key: str, secret_key: str, token: str | None) -> urllib.request.Request:
    now = datetime.datetime.now(datetime.timezone.utc)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    date = now.strftime("%Y%m%d")
    region = os.environ.get("AWS_REGION", "us-east-1")

    headers = {
        "content-type": "application/x-www-form-urlencoded; charset=utf-8",
        "host": STS_HOST,
        "x-amz-date": amz_date,
    }
    if token:
        headers["x-amz-security-token"] = token
    signed = ";".join(sorted(headers))
    canonical_headers = "".join(f"{k}:{headers[k]}\n" for k in sorted(headers))
    canonical_request = "\n".join(
        [
            "POST",
            "/",
            "",
            canonical_headers,
            signed,
            hashlib.sha256(BODY.encode()).hexdigest(),
        ]
    )
    scope = f"{date}/{region}/sts/aws4_request"
    string_to_sign = "\n".join(
        [
            "AWS4-HMAC-SHA256",
            amz_date,
            scope,
            hashlib.sha256(canonical_request.encode()).hexdigest(),
        ]
    )
    key = _hmac(
        _hmac(_hmac(_hmac(("AWS4" + secret_key).encode(), date), region), "sts"),
        "aws4_request",
    )
    signature = hmac.new(key, string_to_sign.encode(), hashlib.sha256).hexdigest()

    request = urllib.request.Request(f"https://{STS_HOST}/", data=BODY.encode(), method="POST")
    for name, value in headers.items():
        request.add_header(name, value)
    request.add_header(
        "Authorization",
        f"AWS4-HMAC-SHA256 Credential={access_key}/{scope}, "
        f"SignedHeaders={signed}, Signature={signature}",
    )
    return request


def main() -> int:
    access_key = os.environ.get("AWS_ACCESS_KEY_ID")
    secret_key = os.environ.get("AWS_SECRET_ACCESS_KEY")
    if not access_key or not secret_key:
        print("AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY is not set.", file=sys.stderr)
        return 2

    request = _signed_request(access_key, secret_key, os.environ.get("AWS_SESSION_TOKEN"))
    try:
        body = urllib.request.urlopen(request, timeout=20).read().decode()
    except urllib.error.HTTPError as error:
        # The STS error body names the problem; it contains no credentials.
        message = re.sub(r"\s+", " ", error.read().decode())[:300]
        print(f"STS refused the request: HTTP {error.code}. {message}", file=sys.stderr)
        return 1

    account = re.search(r"<Account>(\d+)</Account>", body)
    arn = re.search(r"<Arn>([^<]+)</Arn>", body)
    print(f"Account: {account.group(1) if account else 'unknown'}")
    print(f"Arn: {arn.group(1) if arn else 'unknown'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
