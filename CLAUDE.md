# AWS Agent Toolkit Rules

## AWS MCP Server Usage

- Prefer the AWS MCP Server for AWS interactions when available. It provides sandboxed execution, observability, and audit logging.
- If the MCP server is unavailable, use the AWS CLI directly.
- Always check that the AWS MCP Server is properly configured with the `parmana` profile before making AWS API calls.

## Skill Discovery & Loading

- Before starting any AWS task, check whether a relevant AWS skill is available by using `retrieve_skill`.
- Load the appropriate skill based on the task (e.g., amazon-bedrock for LLMs, aws-security for security tasks, aws-storage for S3).
- Prefer skill guidance over general knowledge when working with AWS services.
- If uncertain about AWS-specific details, verify against official documentation rather than guessing.

## Infrastructure as Code

- When creating AWS infrastructure, prefer infrastructure-as-code (AWS CDK or CloudFormation) over direct CLI commands.
- Use TypeScript/Node.js for CDK when possible to match your project's language.
- Store infrastructure code in version control alongside application code.

## AWS Well-Architected Framework

- Follow AWS Well-Architected Framework principles when designing infrastructure:
  - Operational Excellence: automate deployments, monitor systems
  - Security: principle of least privilege, encrypt data at rest and in transit
  - Reliability: design for failure, implement health checks
  - Performance Efficiency: right-size resources, use caching
  - Cost Optimization: monitor spending, use serverless where appropriate

## Secret & Credential Safety

- MUST load the aws-secrets-manager skill first for any secret, credential, API key, token, or password task.
- Do NOT call secretsmanager get-secret-value directly.
- Use AWS Secrets Manager for all credentials and sensitive data.
- Configure the parmana AWS CLI profile with proper credential isolation.
- Never commit credentials, API keys, or secrets to version control.

## Region & Profile Consistency

- Default region: ap-south-1 (Mumbai) unless project specifies otherwise.
- Default profile: parmana (configured via AWS MCP Server).
- Always specify region and profile in CLI commands to avoid unintended cross-region operations.

## Documentation & Verification

- When uncertain about API parameters, permissions limits, or error codes, verify against official AWS documentation.
- State uncertainty explicitly if you cannot confirm a detail.

## Project-Specific Context

- Repository: github.com/pavancharak/parmana (PUBLIC - no secrets)
- AWS Account: 013659367671 (parmana profile)
- AWS Region: ap-south-1 (Mumbai)
- Primary Language: TypeScript/Node.js
- Deployment Target: Vercel (production is Vercel only)

## Best Practices for This Project

- Use TypeScript strict mode for type safety
- Leverage Parmana's authorization layer for agent execution verification
- Test AWS integrations locally before deploying to production
- Use environment variables for configuration (see .env.example)
- Implement proper error handling for AWS API calls
- Monitor CloudWatch logs for production deployments
