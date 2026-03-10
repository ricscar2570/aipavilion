// Products API Handler
const { DynamoDBClient, ScanCommand, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");

const client = new DynamoDBClient({});
const TABLE_NAME = process.env.STANDS_TABLE || 'ai-pavilion-stands';

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };
    
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }
    
    try {
        const path = event.path;
        
        // GET /stands - List all stands
        if (path === '/stands' && event.httpMethod === 'GET') {
            const command = new ScanCommand({ TableName: TABLE_NAME });
            const response = await client.send(command);
            
            const stands = response.Items.map(item => unmarshall(item));
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(stands)
            };
        }
        
        // GET /stands/{id} - Get stand details
        if (path.match(/\/stands\/[^\/]+$/) && event.httpMethod === 'GET') {
            const standId = path.split('/').pop();
            
            const command = new GetItemCommand({
                TableName: TABLE_NAME,
                Key: marshall({ stand_id: standId })
            });
            
            const response = await client.send(command);
            
            if (!response.Item) {
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({ error: 'Stand not found' })
                };
            }
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(unmarshall(response.Item))
            };
        }
        
        return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ error: 'Not found' })
        };
        
    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};
