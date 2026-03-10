const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({ region: "us-east-1" });
const ddb = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
    console.log('Event:', JSON.stringify(event));
    
    try {
        const params = {
            TableName: 'ai-pavilion-stands'
        };
        
        const result = await ddb.send(new ScanCommand(params));
        let stands = result.Items || [];
        
        // Check if this is /stands/sponsored endpoint
        const path = event.path || event.rawPath || '';
        console.log('Request path:', path);
        
        if (path.includes('/sponsored')) {
            console.log('Filtering sponsored stands...');
            stands = stands.filter(stand => stand.is_sponsored === true);
            console.log('Sponsored stands found:', stands.length);
        }
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                stands: stands,
                count: stands.length
            })
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                message: 'Error fetching stands',
                error: error.message
            })
        };
    }
};
