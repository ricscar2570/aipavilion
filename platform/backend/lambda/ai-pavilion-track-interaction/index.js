const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { v4: uuidv4 } = require('uuid');

exports.handler = async (event) => {
    console.log('TrackInteraction - Event:', JSON.stringify(event));
    
    const tableInteractions = process.env.TABLE_INTERACTIONS;
    
    let body;
    try {
        body = JSON.parse(event.body);
    } catch (e) {
        return {
            statusCode: 400,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ success: false, error: 'Invalid JSON' })
        };
    }
    
    const { user_id, stand_id, interaction_type } = body;
    
    if (!user_id || !stand_id || !interaction_type) {
        return {
            statusCode: 400,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ 
                success: false, 
                error: 'Missing required fields' 
            })
        };
    }
    
    try {
        const interaction = {
            interaction_id: uuidv4(),
            user_id: user_id,
            stand_id: stand_id,
            interaction_type: interaction_type,
            timestamp: Date.now(),
            created_at: new Date().toISOString()
        };
        
        await dynamodb.put({
            TableName: tableInteractions,
            Item: interaction
        }).promise();
        
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                interaction: interaction
            })
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ success: false, error: error.message })
        };
    }
};
