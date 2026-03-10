const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({ region: "us-east-1" });
const ddb = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
    console.log('Event:', JSON.stringify(event));
    
    const query = event.queryStringParameters?.q?.toLowerCase();
    
    if (!query) {
        return {
            statusCode: 400,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ message: 'Missing search query' })
        };
    }
    
    try {
        const params = {
            TableName: 'ai-pavilion-stands'
        };
        
        const result = await ddb.send(new ScanCommand(params));
        
        const filtered = (result.Items || []).filter(item => {
            const searchText = `${item.name} ${item.category} ${item.description} ${item.tags?.join(' ')}`.toLowerCase();
            return searchText.includes(query);
        });
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                stands: filtered,
                count: filtered.length,
                query
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
                message: 'Error searching stands',
                error: error.message
            })
        };
    }
};
