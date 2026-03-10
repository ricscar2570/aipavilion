/**
 * AI Pavilion - Comprehensive Monitoring System
 * Production-grade observability with CloudWatch, X-Ray, and custom metrics
 * 
 * Features:
 * - Real-time performance monitoring
 * - Error tracking and alerting
 * - Business metrics tracking
 * - Custom dashboards
 * - Automated alerts
 * - Log aggregation
 */

const { CloudWatchClient, PutMetricDataCommand, GetMetricStatisticsCommand } = require("@aws-sdk/client-cloudwatch");
const { CloudWatchLogsClient, PutLogEventsCommand, CreateLogStreamCommand } = require("@aws-sdk/client-cloudwatch-logs");
const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");

class MonitoringSystem {
    constructor(config = {}) {
        this.cloudwatch = new CloudWatchClient({ region: config.region || 'us-east-1' });
        this.logs = new CloudWatchLogsClient({ region: config.region || 'us-east-1' });
        this.sns = new SNSClient({ region: config.region || 'us-east-1' });
        
        this.namespace = config.namespace || 'AIPayilion/Production';
        this.alertTopicArn = config.alertTopicArn;
        this.logGroupName = config.logGroupName || '/ai-pavilion/application';
    }
    
    /**
     * Track Performance Metrics
     */
    async trackPerformance(metricName, value, unit = 'Milliseconds', dimensions = {}) {
        try {
            const params = {
                Namespace: this.namespace,
                MetricData: [{
                    MetricName: metricName,
                    Value: value,
                    Unit: unit,
                    Timestamp: new Date(),
                    Dimensions: Object.entries(dimensions).map(([key, value]) => ({
                        Name: key,
                        Value: String(value)
                    }))
                }]
            };
            
            await this.cloudwatch.send(new PutMetricDataCommand(params));
            console.log(`[Monitoring] Tracked ${metricName}: ${value}${unit}`);
            
        } catch (error) {
            console.error('[Monitoring] Failed to track performance:', error);
        }
    }
    
    /**
     * Track Business Metrics
     */
    async trackBusinessMetric(metric, value, dimensions = {}) {
        const metrics = {
            'Orders': { value, unit: 'Count' },
            'Revenue': { value, unit: 'None' },
            'ActiveUsers': { value, unit: 'Count' },
            'StandViews': { value, unit: 'Count' },
            'ConversionRate': { value, unit: 'Percent' },
            'AverageOrderValue': { value, unit: 'None' }
        };
        
        const metricConfig = metrics[metric];
        if (!metricConfig) {
            console.warn(`[Monitoring] Unknown business metric: ${metric}`);
            return;
        }
        
        await this.trackPerformance(
            metric,
            metricConfig.value,
            metricConfig.unit,
            { Category: 'Business', ...dimensions }
        );
    }
    
    /**
     * Track Errors
     */
    async trackError(error, context = {}) {
        try {
            // Log error
            await this.logError(error, context);
            
            // Increment error count metric
            await this.trackPerformance('Errors', 1, 'Count', {
                ErrorType: error.name || 'Unknown',
                Service: context.service || 'Unknown'
            });
            
            // Send alert if critical
            if (context.critical) {
                await this.sendAlert(
                    'Critical Error Detected',
                    this.formatErrorAlert(error, context),
                    'high'
                );
            }
            
        } catch (err) {
            console.error('[Monitoring] Failed to track error:', err);
        }
    }
    
    /**
     * Log Error with Context
     */
    async logError(error, context = {}) {
        const logMessage = {
            timestamp: new Date().toISOString(),
            level: 'ERROR',
            message: error.message,
            stack: error.stack,
            context: context,
            requestId: context.requestId,
            userId: context.userId,
            service: context.service
        };
        
        await this.writeLog('errors', JSON.stringify(logMessage));
    }
    
    /**
     * Write Log to CloudWatch
     */
    async writeLog(streamName, message) {
        try {
            // Create log stream if doesn't exist
            try {
                await this.logs.send(new CreateLogStreamCommand({
                    logGroupName: this.logGroupName,
                    logStreamName: streamName
                }));
            } catch (error) {
                // Stream might already exist, ignore
            }
            
            // Write log event
            await this.logs.send(new PutLogEventsCommand({
                logGroupName: this.logGroupName,
                logStreamName: streamName,
                logEvents: [{
                    message: message,
                    timestamp: Date.now()
                }]
            }));
            
        } catch (error) {
            console.error('[Monitoring] Failed to write log:', error);
        }
    }
    
    /**
     * Send Alert
     */
    async sendAlert(subject, message, priority = 'medium') {
        if (!this.alertTopicArn) {
            console.warn('[Monitoring] No alert topic configured');
            return;
        }
        
        try {
            const attributes = {
                priority: { DataType: 'String', StringValue: priority }
            };
            
            await this.sns.send(new PublishCommand({
                TopicArn: this.alertTopicArn,
                Subject: subject,
                Message: message,
                MessageAttributes: attributes
            }));
            
            console.log(`[Monitoring] Alert sent: ${subject}`);
            
        } catch (error) {
            console.error('[Monitoring] Failed to send alert:', error);
        }
    }
    
    /**
     * Format Error Alert
     */
    formatErrorAlert(error, context) {
        return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 CRITICAL ERROR DETECTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Error: ${error.message}
Type: ${error.name}
Time: ${new Date().toISOString()}

Service: ${context.service || 'Unknown'}
Request ID: ${context.requestId || 'N/A'}
User ID: ${context.userId || 'N/A'}

Stack Trace:
${error.stack}

Context:
${JSON.stringify(context, null, 2)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Action Required: Investigate immediately
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        `;
    }
    
    /**
     * Get Metrics
     */
    async getMetrics(metricName, startTime, endTime, period = 300) {
        try {
            const params = {
                Namespace: this.namespace,
                MetricName: metricName,
                StartTime: startTime,
                EndTime: endTime,
                Period: period,
                Statistics: ['Average', 'Sum', 'Maximum', 'Minimum', 'SampleCount']
            };
            
            const response = await this.cloudwatch.send(
                new GetMetricStatisticsCommand(params)
            );
            
            return response.Datapoints;
            
        } catch (error) {
            console.error('[Monitoring] Failed to get metrics:', error);
            return [];
        }
    }
    
    /**
     * Health Check
     */
    async healthCheck() {
        const checks = {
            timestamp: new Date().toISOString(),
            status: 'healthy',
            checks: {}
        };
        
        // Check recent errors
        const recentErrors = await this.getMetrics(
            'Errors',
            new Date(Date.now() - 5 * 60 * 1000), // Last 5 minutes
            new Date(),
            60
        );
        
        const errorCount = recentErrors.reduce((sum, dp) => sum + (dp.Sum || 0), 0);
        checks.checks.errors = {
            status: errorCount > 10 ? 'unhealthy' : 'healthy',
            count: errorCount
        };
        
        // Check response times
        const responseTimes = await this.getMetrics(
            'ResponseTime',
            new Date(Date.now() - 5 * 60 * 1000),
            new Date(),
            60
        );
        
        const avgResponseTime = responseTimes.length > 0
            ? responseTimes.reduce((sum, dp) => sum + (dp.Average || 0), 0) / responseTimes.length
            : 0;
            
        checks.checks.performance = {
            status: avgResponseTime > 1000 ? 'degraded' : 'healthy',
            averageResponseTime: avgResponseTime
        };
        
        // Overall status
        if (checks.checks.errors.status === 'unhealthy' || 
            checks.checks.performance.status === 'degraded') {
            checks.status = 'degraded';
        }
        
        return checks;
    }
    
    /**
     * Create Custom Dashboard
     */
    async createDashboard(dashboardName, widgets) {
        // Dashboard configuration for CloudWatch
        const dashboardBody = {
            widgets: widgets.map((widget, index) => ({
                type: 'metric',
                x: (index % 3) * 8,
                y: Math.floor(index / 3) * 6,
                width: 8,
                height: 6,
                properties: {
                    metrics: [[this.namespace, widget.metric]],
                    period: 300,
                    stat: widget.stat || 'Average',
                    region: 'us-east-1',
                    title: widget.title
                }
            }))
        };
        
        console.log(`[Monitoring] Dashboard config for ${dashboardName}:`, 
                    JSON.stringify(dashboardBody, null, 2));
        
        return dashboardBody;
    }
}

/**
 * Monitoring Middleware for Lambda
 */
class LambdaMonitoring {
    constructor(monitoringSystem) {
        this.monitoring = monitoringSystem;
    }
    
    /**
     * Wrap Lambda Handler with Monitoring
     */
    wrap(handler) {
        return async (event, context) => {
            const startTime = Date.now();
            const requestId = context.requestId;
            
            try {
                // Track invocation
                await this.monitoring.trackPerformance('LambdaInvocations', 1, 'Count', {
                    FunctionName: context.functionName
                });
                
                // Execute handler
                const result = await handler(event, context);
                
                // Track success
                const duration = Date.now() - startTime;
                await this.monitoring.trackPerformance('ResponseTime', duration, 'Milliseconds', {
                    FunctionName: context.functionName,
                    StatusCode: result.statusCode || 200
                });
                
                await this.monitoring.trackPerformance('SuccessfulInvocations', 1, 'Count', {
                    FunctionName: context.functionName
                });
                
                return result;
                
            } catch (error) {
                // Track error
                const duration = Date.now() - startTime;
                await this.monitoring.trackError(error, {
                    service: context.functionName,
                    requestId: requestId,
                    event: event,
                    critical: true
                });
                
                await this.monitoring.trackPerformance('FailedInvocations', 1, 'Count', {
                    FunctionName: context.functionName
                });
                
                throw error;
            }
        };
    }
}

/**
 * Real-time Monitoring Dashboard Data
 */
class RealtimeDashboard {
    constructor(monitoringSystem) {
        this.monitoring = monitoringSystem;
    }
    
    /**
     * Get Dashboard Data
     */
    async getDashboardData() {
        const now = new Date();
        const oneHourAgo = new Date(now - 60 * 60 * 1000);
        
        const [
            orders,
            revenue,
            activeUsers,
            errors,
            responseTimes
        ] = await Promise.all([
            this.monitoring.getMetrics('Orders', oneHourAgo, now),
            this.monitoring.getMetrics('Revenue', oneHourAgo, now),
            this.monitoring.getMetrics('ActiveUsers', oneHourAgo, now),
            this.monitoring.getMetrics('Errors', oneHourAgo, now),
            this.monitoring.getMetrics('ResponseTime', oneHourAgo, now)
        ]);
        
        return {
            timestamp: now.toISOString(),
            metrics: {
                orders: this.summarizeMetric(orders),
                revenue: this.summarizeMetric(revenue),
                activeUsers: this.summarizeMetric(activeUsers),
                errors: this.summarizeMetric(errors),
                performance: this.summarizeMetric(responseTimes)
            },
            health: await this.monitoring.healthCheck()
        };
    }
    
    /**
     * Summarize Metric Data
     */
    summarizeMetric(datapoints) {
        if (!datapoints || datapoints.length === 0) {
            return { current: 0, trend: 'stable', change: 0 };
        }
        
        const sorted = datapoints.sort((a, b) => 
            new Date(a.Timestamp) - new Date(b.Timestamp)
        );
        
        const latest = sorted[sorted.length - 1];
        const previous = sorted.length > 1 ? sorted[sorted.length - 2] : latest;
        
        const current = latest.Sum || latest.Average || 0;
        const prev = previous.Sum || previous.Average || 0;
        const change = prev > 0 ? ((current - prev) / prev) * 100 : 0;
        
        return {
            current: current,
            trend: change > 5 ? 'up' : change < -5 ? 'down' : 'stable',
            change: Math.round(change * 100) / 100
        };
    }
}

/**
 * Automated Alerting Rules
 */
class AlertingRules {
    constructor(monitoringSystem) {
        this.monitoring = monitoringSystem;
        this.rules = this.initializeRules();
    }
    
    /**
     * Initialize Alert Rules
     */
    initializeRules() {
        return [
            {
                name: 'HighErrorRate',
                metric: 'Errors',
                threshold: 10,
                period: 300,
                condition: 'GreaterThan',
                action: async (value) => {
                    await this.monitoring.sendAlert(
                        '🚨 High Error Rate Detected',
                        `Error count: ${value} in last 5 minutes\nThreshold: 10`,
                        'high'
                    );
                }
            },
            {
                name: 'SlowResponseTime',
                metric: 'ResponseTime',
                threshold: 1000,
                period: 300,
                condition: 'GreaterThan',
                action: async (value) => {
                    await this.monitoring.sendAlert(
                        '⚠️ Slow Response Time',
                        `Average response time: ${value}ms\nThreshold: 1000ms`,
                        'medium'
                    );
                }
            },
            {
                name: 'LowActiveUsers',
                metric: 'ActiveUsers',
                threshold: 5,
                period: 3600,
                condition: 'LessThan',
                action: async (value) => {
                    await this.monitoring.sendAlert(
                        'ℹ️ Low User Activity',
                        `Active users: ${value}\nExpected: >5`,
                        'low'
                    );
                }
            }
        ];
    }
    
    /**
     * Check All Rules
     */
    async checkRules() {
        for (const rule of this.rules) {
            try {
                await this.checkRule(rule);
            } catch (error) {
                console.error(`[Alerting] Failed to check rule ${rule.name}:`, error);
            }
        }
    }
    
    /**
     * Check Single Rule
     */
    async checkRule(rule) {
        const endTime = new Date();
        const startTime = new Date(endTime - rule.period * 1000);
        
        const datapoints = await this.monitoring.getMetrics(
            rule.metric,
            startTime,
            endTime,
            rule.period
        );
        
        if (datapoints.length === 0) return;
        
        const latest = datapoints[datapoints.length - 1];
        const value = latest.Average || latest.Sum || 0;
        
        const triggered = rule.condition === 'GreaterThan' 
            ? value > rule.threshold
            : value < rule.threshold;
        
        if (triggered) {
            await rule.action(value);
        }
    }
}

// Export classes
module.exports = {
    MonitoringSystem,
    LambdaMonitoring,
    RealtimeDashboard,
    AlertingRules
};

// Example usage in Lambda
/*
const { MonitoringSystem, LambdaMonitoring } = require('./monitoring-system');

const monitoring = new MonitoringSystem({
    region: 'us-east-1',
    namespace: 'AIPayilion/Production',
    alertTopicArn: process.env.ALERT_TOPIC_ARN
});

const lambdaMonitoring = new LambdaMonitoring(monitoring);

exports.handler = lambdaMonitoring.wrap(async (event, context) => {
    // Your Lambda logic here
    
    // Track business metrics
    await monitoring.trackBusinessMetric('Orders', 1);
    await monitoring.trackBusinessMetric('Revenue', 49.99);
    
    return {
        statusCode: 200,
        body: JSON.stringify({ success: true })
    };
});
*/
