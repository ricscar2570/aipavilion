# AI Pavilion

Virtual fair platform - Work in progress

## Quick Links

- Live: http://ai-pavilion-frontend-789382030021.s3-website-us-east-1.amazonaws.com
- API: https://xcbvr1zx7c.execute-api.us-east-1.amazonaws.com/prod

## Structure

- `frontend/` - Static website
- `backend/lambda/` - Lambda functions
- `backend/schemas/` - DynamoDB schemas

## Deploy
```bash
# Frontend
aws s3 sync frontend/ s3://ai-pavilion-frontend-789382030021/

# Lambda
cd backend/lambda/FUNCTION_NAME
zip -r function.zip .
aws lambda update-function-code --function-name FUNCTION_NAME --zip-file fileb://function.zip
```
