import type { SupabaseClient } from '@supabase/supabase-js';
import { enqueue } from '@/lib/jobs/queue';

export interface WorkflowDefinition {
  trigger: {
    type: string;
    nextNodeId: string | null;
  };
  nodes: Record<string, WorkflowNode>;
}

export interface WorkflowNode {
  id: string;
  type: 'condition' | 'action' | 'delay' | 'wait_until';
  name: string;
  config: any;
  nextNodeId?: string | null;       // for actions/delays
  trueNodeId?: string | null;       // for conditions
  falseNodeId?: string | null;      // for conditions
}

export interface LogEntry {
  timestamp: string;
  nodeId: string;
  nodeName: string;
  nodeType: string;
  status: 'info' | 'success' | 'failed' | 'paused';
  message: string;
}

/**
 * Triggers all active workflows matching the given event name
 */
export async function triggerWorkflows(
  eventName: string,
  eventPayload: any,
  supabase: SupabaseClient
): Promise<void> {
  try {
    // 1. Resolve Customer ID
    let customerId: string | null = null;
    
    if (eventPayload.userId) {
      const { data: link } = await supabase
        .from('customer_identity_links')
        .select('customer_id')
        .eq('identity_type', 'user_id')
        .eq('identity_value', String(eventPayload.userId))
        .limit(1)
        .maybeSingle();
      if (link) customerId = link.customer_id;
    }
    
    if (!customerId && eventPayload.anonymousId) {
      const { data: link } = await supabase
        .from('customer_identity_links')
        .select('customer_id')
        .eq('identity_type', 'anonymous_id')
        .eq('identity_value', String(eventPayload.anonymousId))
        .limit(1)
        .maybeSingle();
      if (link) customerId = link.customer_id;
    }
    
    // If we still don't have customer_id, check in properties (for webhook triggers)
    if (!customerId && eventPayload.properties?.email) {
      const { data: profile } = await supabase
        .from('customer_profiles')
        .select('id')
        .eq('email', eventPayload.properties.email)
        .limit(1)
        .maybeSingle();
      if (profile) customerId = profile.id;
    }

    // 2. Fetch all active workflows with matching trigger
    const { data: activeWorkflows, error } = await supabase
      .from('workflows')
      .select('*')
      .eq('trigger_type', eventName)
      .eq('is_active', true);

    if (error) {
      console.error('[WORKFLOW_ENGINE] Error loading active workflows:', error);
      return;
    }

    if (!activeWorkflows || activeWorkflows.length === 0) {
      return;
    }

    console.log(`[WORKFLOW_ENGINE] Found ${activeWorkflows.length} active workflows matching trigger: ${eventName}`);

    for (const workflow of activeWorkflows) {
      const def = workflow.definition as unknown as WorkflowDefinition;
      if (!def || !def.trigger || !def.trigger.nextNodeId) {
        continue;
      }

      // 3. Create Execution Record
      const { data: execution, error: execError } = await supabase
        .from('workflow_executions')
        .insert({
          workflow_id: workflow.id,
          status: 'started',
          correlation_id: eventPayload.correlationId || eventPayload.eventId || null,
          customer_id: customerId,
          trigger_source: eventName,
          trigger_payload: eventPayload,
          logs: [
            {
              timestamp: new Date().toISOString(),
              nodeId: 'trigger',
              nodeName: 'Trigger Node',
              nodeType: 'trigger',
              status: 'info',
              message: `Workflow triggered by event: ${eventName}. Customer ID resolved: ${customerId || 'None'}`
            }
          ] as any[]
        })
        .select('id')
        .single();

      if (execError) {
        console.error('[WORKFLOW_ENGINE] Failed to insert execution record:', execError);
        continue;
      }

      // 4. Run execution asynchronously
      void runExecution(execution.id, def.trigger.nextNodeId, supabase).catch(err => {
        console.error(`[WORKFLOW_ENGINE] Error running execution ${execution.id}:`, err);
      });
    }
  } catch (err) {
    console.error('[WORKFLOW_ENGINE] Top level error in triggerWorkflows:', err);
  }
}

/**
 * Triggers a specific workflow ID directly
 */
export async function triggerSpecificWorkflow(
  workflowId: string,
  customerId: string | null,
  eventPayload: any,
  supabase: SupabaseClient
): Promise<void> {
  const { data: workflow, error } = await supabase
    .from('workflows')
    .select('*')
    .eq('id', workflowId)
    .single();

  if (error || !workflow) {
    console.error(`[WORKFLOW_ENGINE] Specific workflow not found: ${workflowId}`);
    return;
  }

  const def = workflow.definition as unknown as WorkflowDefinition;
  if (!def || !def.trigger || !def.trigger.nextNodeId) {
    return;
  }

  const { data: execution, error: execError } = await supabase
    .from('workflow_executions')
    .insert({
      workflow_id: workflow.id,
      status: 'started',
      correlation_id: eventPayload.correlationId || eventPayload.eventId || null,
      customer_id: customerId,
      trigger_source: 'sub_workflow',
      trigger_payload: eventPayload,
      logs: [
        {
          timestamp: new Date().toISOString(),
          nodeId: 'trigger',
          nodeName: 'Trigger Node',
          nodeType: 'trigger',
          status: 'info',
          message: `Sub-workflow triggered. Customer ID: ${customerId}`
        }
      ] as any[]
    })
    .select('id')
    .single();

  if (execError) return;

  void runExecution(execution.id, def.trigger.nextNodeId, supabase);
}

/**
 * Executes a workflow run sequentially starting from the given nodeId
 */
export async function runExecution(
  executionId: string,
  startNodeId: string,
  supabase: SupabaseClient
): Promise<void> {
  const startTime = Date.now();
  
  // 1. Fetch Execution and Workflow Definition
  const { data: exec, error: execErr } = await supabase
    .from('workflow_executions')
    .select('*, workflows(*)')
    .eq('id', executionId)
    .single();

  if (execErr || !exec) {
    console.error(`[WORKFLOW_ENGINE] Failed to load execution context for run: ${executionId}`);
    return;
  }

  const workflow = exec.workflows;
  const def = workflow.definition as unknown as WorkflowDefinition;
  const payload = exec.trigger_payload;
  const customerId = exec.customer_id;
  const existingLogs: LogEntry[] = (exec.logs || []) as unknown as LogEntry[];
  
  // Update execution status to 'running'
  await supabase
    .from('workflow_executions')
    .update({ status: 'running' })
    .eq('id', executionId);

  // 2. Fetch Customer Context
  let customer: any = null;
  if (customerId) {
    const { data: profile } = await supabase
      .from('customer_profiles')
      .select('*, scores:customer_scores(*), segments:customer_segments(segment_name), preferences:customer_preferences(*)')
      .eq('id', customerId)
      .maybeSingle();
    customer = profile;
  }

  let currentNodeId: string | null = startNodeId;
  const newLogs: LogEntry[] = [];
  let executionFailed = false;
  let executionErrorMessage = '';
  let pausedForDelay = false;
  
  // Track dynamic intermediate states (e.g. generated coupon code)
  const state: Record<string, any> = {};

  const addLog = (nodeId: string, nodeName: string, nodeType: string, status: LogEntry['status'], message: string) => {
    const log: LogEntry = {
      timestamp: new Date().toISOString(),
      nodeId,
      nodeName,
      nodeType,
      status,
      message
    };
    newLogs.push(log);
    console.log(`[WORKFLOW_EXECUTION_LOG] [${status.toUpperCase()}] ${nodeName}: ${message}`);
  };

  try {
    while (currentNodeId && !executionFailed && !pausedForDelay) {
      const node: WorkflowNode = def.nodes[currentNodeId];
      if (!node) {
        addLog(currentNodeId, 'Unknown Node', 'unknown', 'failed', `Node definition not found for ID: ${currentNodeId}`);
        executionFailed = true;
        executionErrorMessage = `Node definition not found for ID: ${currentNodeId}`;
        break;
      }

      const params = node.config?.params || {};
      
      if (node.type === 'condition') {
        // --- CONDITION NODE ---
        addLog(node.id, node.name, 'condition', 'info', 'Evaluating condition block...');
        const result = evaluateConditionGroup(node.config, customer, payload);
        addLog(node.id, node.name, 'condition', 'success', `Condition outcome is: ${result}`);
        
        currentNodeId = result ? (node.trueNodeId || null) : (node.falseNodeId || null);
      } 
      else if (node.type === 'action') {
        // --- ACTION NODE ---
        addLog(node.id, node.name, 'action', 'info', `Executing action: ${node.config?.actionType}...`);
        
        try {
          const actionType = node.config?.actionType;
          
          if (actionType === 'send_internal_notification') {
            const title = interpolate(params.title || 'Internal Notification', customer, payload, state);
            const body = interpolate(params.body || '', customer, payload, state);
            
            const { sendCommunication } = await import('@/lib/communication/engine');
            await sendCommunication({
              customerId: customer?.id || null,
              channel: 'push',
              subject: title,
              body: body,
              metadata: { type: 'admin_notify' }
            });
            addLog(node.id, node.name, 'action', 'success', `Dispatched admin notification via Comm Hub: "${title}"`);
          } 
          else if (actionType === 'send_email') {
            const subject = interpolate(params.subject || 'PANTHER Update', customer, payload, state);
            const content = interpolate(params.content || params.body || '', customer, payload, state);
            const templateId = params.templateId || null;
            
            const { sendCommunication } = await import('@/lib/communication/engine');
            await sendCommunication({
              customerId: customer?.id || null,
              contactValue: customer?.email || params.email || '',
              channel: 'email',
              templateId,
              subject,
              body: content,
              variables: { ...state, ...payload.properties }
            });
            addLog(node.id, node.name, 'action', 'success', `Dispatched email via Comm Hub to ${customer?.email || params.email}`);
          }
          else if (actionType === 'send_whatsapp') {
            const content = interpolate(params.content || params.body || '', customer, payload, state);
            const templateId = params.templateId || null;
            
            const { sendCommunication } = await import('@/lib/communication/engine');
            await sendCommunication({
              customerId: customer?.id || null,
              contactValue: customer?.phone || params.phone || '',
              channel: 'whatsapp',
              templateId,
              body: content,
              variables: { ...state, ...payload.properties },
              metadata: params.templateName ? { templateName: params.templateName } : undefined
            });
            addLog(node.id, node.name, 'action', 'success', `Dispatched WhatsApp via Comm Hub to ${customer?.phone || params.phone}`);
          }
          else if (actionType === 'add_tag') {
            if (!customer) {
              throw new Error('No customer profile associated with execution to tag');
            }
            const tag = params.tag;
            const currentTags = customer.tags || [];
            if (!currentTags.includes(tag)) {
              const newTags = [...currentTags, tag];
              await supabase
                .from('customer_profiles')
                .update({ tags: newTags, updated_at: new Date().toISOString() })
                .eq('id', customer.id);
              
              // update local reference
              customer.tags = newTags;
              addLog(node.id, node.name, 'action', 'success', `Successfully added tag: "${tag}" to customer`);
            } else {
              addLog(node.id, node.name, 'action', 'success', `Customer already has tag: "${tag}" (no-op)`);
            }
          } 
          else if (actionType === 'remove_tag') {
            if (!customer) {
              throw new Error('No customer profile associated with execution to untag');
            }
            const tag = params.tag;
            const currentTags = customer.tags || [];
            if (currentTags.includes(tag)) {
              const newTags = currentTags.filter((t: string) => t !== tag);
              await supabase
                .from('customer_profiles')
                .update({ tags: newTags, updated_at: new Date().toISOString() })
                .eq('id', customer.id);
              
              customer.tags = newTags;
              addLog(node.id, node.name, 'action', 'success', `Successfully removed tag: "${tag}" from customer`);
            } else {
              addLog(node.id, node.name, 'action', 'success', `Customer does not have tag: "${tag}" (no-op)`);
            }
          } 
          else if (actionType === 'add_segment') {
            if (!customer) {
              throw new Error('No customer profile associated with execution');
            }
            const segment = params.segment;
            await supabase
              .from('customer_segments')
              .upsert({ customer_id: customer.id, segment_name: segment }, { onConflict: 'customer_id,segment_name' });
            
            addLog(node.id, node.name, 'action', 'success', `Successfully added segment: "${segment}"`);
          } 
          else if (actionType === 'remove_segment') {
            if (!customer) {
              throw new Error('No customer profile associated');
            }
            const segment = params.segment;
            await supabase
              .from('customer_segments')
              .delete()
              .eq('customer_id', customer.id)
              .eq('segment_name', segment);
            
            addLog(node.id, node.name, 'action', 'success', `Successfully removed segment: "${segment}"`);
          } 
          else if (actionType === 'create_admin_note') {
            const orderId = payload.properties?.orderId || payload.properties?.order_id || payload.orderId || payload.order_id || null;
            if (!orderId) {
              addLog(node.id, node.name, 'action', 'info', 'Skipped note creation: no order context in event');
            } else {
              const noteContent = interpolate(params.content || 'Workflow automation admin note', customer, payload, state);
              await supabase
                .from('admin_notes')
                .insert({
                  order_id: orderId,
                  admin_id: '00000000-0000-0000-0000-000000000000', // Default system account
                  admin_email: 'workflow-engine@panther.internal',
                  content: noteContent.slice(0, 1000)
                });
              addLog(node.id, node.name, 'action', 'success', `Added admin note to order ID: ${orderId}`);
            }
          } 
          else if (actionType === 'generate_coupon') {
            const codePrefix = (params.codePrefix || 'FLOW').toUpperCase().trim();
            const discountPercent = Math.min(100, Math.max(1, Number(params.discountPercent || 10)));
            const expiryHours = Number(params.expiryHours || 24);
            
            const suffix = Math.random().toString(36).substring(2, 8).toUpperCase();
            const couponCode = `${codePrefix}-${discountPercent}-${suffix}`;
            
            const startsAt = new Date();
            const expiresAt = new Date(startsAt.getTime() + expiryHours * 60 * 60 * 1000);
            
            await supabase
              .from('coupons')
              .insert({
                code: couponCode,
                discount_percent: discountPercent,
                is_active: true,
                starts_at: startsAt.toISOString(),
                expires_at: expiresAt.toISOString(),
                usage_limit: 1,
                per_user_limit: 1
              });
            
            // Store code in execution state so next nodes can refer to it
            state.lastGeneratedCouponCode = couponCode;
            addLog(node.id, node.name, 'action', 'success', `Generated coupon: ${couponCode} (${discountPercent}% off)`);
          } 
          else if (actionType === 'apply_coupon') {
            if (!customer) {
              throw new Error('No customer profile associated with execution');
            }
            const couponCode = params.couponCode || state.lastGeneratedCouponCode;
            if (!couponCode) {
              throw new Error('No coupon code specified or generated in parent action');
            }
            
            const currentCoupons = customer.applied_coupons || [];
            if (!currentCoupons.includes(couponCode)) {
              const newCoupons = [...currentCoupons, couponCode];
              await supabase
                .from('customer_profiles')
                .update({ applied_coupons: newCoupons, updated_at: new Date().toISOString() })
                .eq('id', customer.id);
              
              customer.applied_coupons = newCoupons;
              addLog(node.id, node.name, 'action', 'success', `Applied coupon code ${couponCode} to customer profile`);
            } else {
              addLog(node.id, node.name, 'action', 'success', `Coupon code ${couponCode} is already applied (no-op)`);
            }
          } 
          else if (actionType === 'http_request' || actionType === 'webhook') {
            const url = interpolate(params.url || '', customer, payload, state);
            const method = params.method || 'POST';
            const headers = params.headers || {};
            const requestBody = params.body 
              ? interpolate(params.body, customer, payload, state)
              : JSON.stringify({ event: payload, customer, state });
            
            if (!url) {
              throw new Error('HTTP Request target URL is empty');
            }

            const res = await fetch(url, {
              method,
              headers: { 'Content-Type': 'application/json', ...headers },
              body: method !== 'GET' && method !== 'HEAD' ? requestBody : undefined
            });
            
            addLog(node.id, node.name, 'action', 'success', `Outbound webhook call completed. Status code: ${res.status}`);
          } 
          else if (actionType === 'execute_another_workflow') {
            const subWorkflowId = params.workflowId;
            if (!subWorkflowId) {
              throw new Error('No workflow ID specified to execute');
            }
            await triggerSpecificWorkflow(subWorkflowId, customer?.id || null, payload, supabase);
            addLog(node.id, node.name, 'action', 'success', `Dispatched sub-workflow: ${subWorkflowId}`);
          } 
          else {
            // Placeholder actions
            addLog(node.id, node.name, 'action', 'success', `Executed placeholder action: ${actionType} (mock success)`);
          }
        } catch (err: any) {
          const msg = err instanceof Error ? err.message : String(err);
          addLog(node.id, node.name, 'action', 'failed', `Action execution failed: ${msg}`);
          executionFailed = true;
          executionErrorMessage = msg;
          break;
        }

        currentNodeId = node.nextNodeId || null;
      } 
      else if (node.type === 'delay' || node.type === 'wait_until') {
        // --- DELAY / WAIT UNTIL NODE ---
        let runAt = new Date();
        let delayDetails = '';

        if (node.type === 'delay') {
          const duration = Number(params.duration || 1);
          const unit = params.unit || 'minutes'; // minutes, hours, days
          const multiplier = unit === 'days' ? 24 * 60 * 60 * 1000 : unit === 'hours' ? 60 * 60 * 1000 : 60 * 1000;
          runAt = new Date(Date.now() + duration * multiplier);
          delayDetails = `for ${duration} ${unit}`;
        } else {
          runAt = new Date(params.dateTime || Date.now());
          delayDetails = `until ${runAt.toLocaleString('en-IN')}`;
        }

        addLog(node.id, node.name, node.type, 'paused', `Workflow paused. Scheduled resume ${delayDetails} at ${runAt.toISOString()}`);
        
        // Enqueue resume job in the background queue
        await enqueue({
          kind: 'workflow.resume',
          payload: {
            executionId,
            resumeNodeId: node.nextNodeId || ''
          },
          runAt
        }, supabase);

        pausedForDelay = true;
      }
    }

    // 3. Finalize Execution State
    const totalDuration = Date.now() - startTime;
    const finalLogs = [...existingLogs, ...newLogs];

    if (executionFailed) {
      await supabase
        .from('workflow_executions')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          duration_ms: totalDuration,
          error_message: executionErrorMessage,
          logs: finalLogs as any
        })
        .eq('id', executionId);
    } else if (pausedForDelay) {
      // Keep state as 'running' (it was set above) but append logs
      await supabase
        .from('workflow_executions')
        .update({
          logs: finalLogs as any
        })
        .eq('id', executionId);
    } else {
      // Completed successfully
      addLog('end', 'Workflow Finished', 'system', 'success', `Workflow execution completed successfully in ${totalDuration}ms`);
      const completedLogs = [...existingLogs, ...newLogs];
      await supabase
        .from('workflow_executions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          duration_ms: totalDuration,
          logs: completedLogs as any
        })
        .eq('id', executionId);
    }
  } catch (err: any) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[WORKFLOW_ENGINE] Uncaught error running execution ${executionId}:`, err);
    
    const crashLogs = [...existingLogs, ...newLogs, {
      timestamp: new Date().toISOString(),
      nodeId: 'uncaught_crash',
      nodeName: 'Runtime Engine',
      nodeType: 'system',
      status: 'failed' as const,
      message: `Fatal engine crash: ${errorMsg}`
    }];
    
    await supabase
      .from('workflow_executions')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: `Fatal engine crash: ${errorMsg}`,
        logs: crashLogs as any
      })
      .eq('id', executionId);
  }
}

/**
 * Resumes execution of a paused workflow
 */
export async function resumeWorkflowExecution(
  executionId: string,
  resumeNodeId: string,
  supabase: SupabaseClient
): Promise<void> {
  console.log(`[WORKFLOW_ENGINE] Resuming workflow execution: ${executionId} at node: ${resumeNodeId}`);
  
  // 1. Fetch current execution logs to append safely
  const { data: exec } = await supabase
    .from('workflow_executions')
    .select('logs')
    .eq('id', executionId)
    .maybeSingle();

  const currentLogs = exec?.logs || [];
  const updatedLogs = [
    ...currentLogs,
    {
      timestamp: new Date().toISOString(),
      nodeId: 'system',
      nodeName: 'Runtime Engine',
      nodeType: 'system',
      status: 'info',
      message: 'Resuming paused workflow execution.'
    }
  ];

  // 2. Set status to 'running' and save the logs
  await supabase
    .from('workflow_executions')
    .update({
      status: 'running',
      logs: updatedLogs as any
    })
    .eq('id', executionId);

  await runExecution(executionId, resumeNodeId, supabase);
}

/**
 * Evaluates nested properties in rule parameters
 */
function evaluateConditionGroup(config: any, customer: any, payload: any): boolean {
  const operator = config.logicalOperator || 'AND';
  const rules = config.conditions || [];
  
  if (rules.length === 0) return true;
  
  if (operator === 'OR') {
    return rules.some((rule: any) => evaluateRule(rule, customer, payload));
  } else {
    return rules.every((rule: any) => evaluateRule(rule, customer, payload));
  }
}

function evaluateRule(rule: any, customer: any, payload: any): boolean {
  const { field, operator, value } = rule;
  
  let actualValue: any = null;
  
  if (!customer) customer = {};
  
  if (field === 'ltv') {
    actualValue = customer.scores?.ltv_paise ? customer.scores.ltv_paise / 100 : 0;
  } else if (field === 'segment') {
    actualValue = customer.segments?.map((s: any) => s.segment_name) || [];
  } else if (field === 'country') {
    actualValue = payload.properties?.country || payload.context?.page?.country || customer.country || '';
  } else if (field === 'order_value') {
    const rawVal = payload.properties?.value || payload.properties?.total_paise || payload.properties?.price || 0;
    actualValue = typeof rawVal === 'number' ? rawVal : parseFloat(rawVal) || 0;
    if (rawVal > 1000 && !payload.properties?.value) {
      actualValue = actualValue / 100;
    }
  } else if (field === 'purchased_count') {
    actualValue = customer.scores?.total_orders || 0;
  } else if (field === 'has_whatsapp') {
    actualValue = customer.preferences?.opt_in_whatsapp ?? false;
  } else if (field === 'has_email') {
    actualValue = customer.preferences?.opt_in_email ?? false;
  } else if (field === 'category') {
    actualValue = payload.properties?.category || '';
  } else if (field === 'campaign_source') {
    actualValue = payload.properties?.utm_source || customer.scores?.utm_source || '';
  } else if (field === 'tag') {
    actualValue = customer.tags || [];
  } else {
    // check inside nested properties
    actualValue = payload.properties?.[field] ?? payload?.[field] ?? null;
  }
  
  switch (operator) {
    case '==':
    case 'equals':
      if (Array.isArray(actualValue)) {
        return actualValue.some(v => String(v).toLowerCase() === String(value).toLowerCase());
      }
      return String(actualValue).toLowerCase() === String(value).toLowerCase();
    case '!=':
    case 'not_equals':
      if (Array.isArray(actualValue)) {
        return !actualValue.some(v => String(v).toLowerCase() === String(value).toLowerCase());
      }
      return String(actualValue).toLowerCase() !== String(value).toLowerCase();
    case '>':
      return Number(actualValue) > Number(value);
    case '>=':
      return Number(actualValue) >= Number(value);
    case '<':
      return Number(actualValue) < Number(value);
    case '<=':
      return Number(actualValue) <= Number(value);
    case 'contains':
      if (Array.isArray(actualValue)) {
        return actualValue.some(v => String(v).toLowerCase().includes(String(value).toLowerCase()));
      }
      return String(actualValue).toLowerCase().includes(String(value).toLowerCase());
    case 'not_contains':
      if (Array.isArray(actualValue)) {
        return !actualValue.some(v => String(v).toLowerCase().includes(String(value).toLowerCase()));
      }
      return !String(actualValue).toLowerCase().includes(String(value).toLowerCase());
    case 'in':
      const list = Array.isArray(value) 
        ? value.map(v => String(v).toLowerCase()) 
        : String(value).split(',').map(s => s.trim().toLowerCase());
      return list.includes(String(actualValue).toLowerCase());
    default:
      return false;
  }
}

/**
 * Replaces token blocks like {{ customer.email }} or {{ payload.properties.price }}
 */
function interpolate(template: string, customer: any, payload: any, state: Record<string, any>): string {
  if (!template) return '';
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (match, path) => {
    const parts = path.split('.');
    let current: any = null;
    
    if (parts[0] === 'customer') {
      current = customer;
    } else if (parts[0] === 'event' || parts[0] === 'payload') {
      current = payload;
    } else if (parts[0] === 'state') {
      current = state;
    } else {
      // Fallback searches
      current = ({ customer, event: payload, payload, state } as Record<string, any>)[parts[0]];
    }
    
    for (let i = 1; i < parts.length; i++) {
      if (current && typeof current === 'object') {
        current = current[parts[i]];
      } else {
        return '';
      }
    }
    
    return current !== undefined && current !== null ? String(current) : '';
  });
}
