# Parmana production image build (CodeBuild)

Builds the API image in AWS and pushes it to `parmana-api` in ECR. Replaces the local Docker push, which failed with a Windows credential-helper error.

## One-time setup

1. `terraform init`, `terraform plan "-var-file=prod.tfvars" "-out=prod.tfplan"`, review, `terraform apply prod.tfplan`.

## Build an image (each release)

Run from the repo root, on a clean commit:

```powershell
cd D:\last\parmana-core
git pull
$tag = git rev-parse --short HEAD
git archive --format=zip -o parmana-src.zip HEAD
aws s3 cp parmana-src.zip s3://parmana-prod-build-source-<ACCOUNT_ID>/source.zip --profile parmana-prod --region ap-south-1
aws codebuild start-build --profile parmana-prod --region ap-south-1 --project-name parmana-api-prod --environment-variables-override "name=IMAGE_TAG,value=$tag,type=PLAINTEXT"
```

Then watch the build in CloudWatch logs group `/aws/codebuild/parmana-api-prod`, or:

```powershell
aws codebuild batch-get-builds --profile parmana-prod --region ap-south-1 --ids <build-id-from-start-build> --query "builds[0].buildStatus"
```

Status must be `SUCCEEDED`. The image is then at `<ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com/parmana-api:<tag>`.

Delete `parmana-src.zip` from the repo folder afterwards. It's a build input, not something to commit.

## Notes

- The source is the committed `HEAD`, so uncommitted changes are not built. That's intended.
- The build role can push to `parmana-api` only, and read the source bucket only.
- The Dockerfile base images are pinned by digest, as before.
