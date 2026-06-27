'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from '../automation.module.css';

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  definition: any;
  is_active: boolean;
}

const TRIGGER_TYPES = [
  { value: 'registration_completed', label: '👤 Customer Registered (registration_completed)' },
  { value: 'product_viewed', label: '👁️ Product Viewed (product_viewed)' },
  { value: 'checkout_started', label: '🛒 Checkout Started (checkout_started)' },
  { value: 'order_created', label: '📦 Order Created (order_created)' },
  { value: 'order_paid', label: '💰 Order Paid (order_paid)' },
  { value: 'order_delivered', label: '🚚 Shipment Delivered (order_delivered)' },
  { value: 'return_requested', label: '🔄 Return Requested (return_requested)' },
  { value: 'exchange_requested', label: '🔀 Exchange Requested (exchange_requested)' },
  { value: 'segment_changed', label: '👥 Customer Segment Changed (segment_changed)' },
  { value: 'manual', label: '⚡ Manual Trigger (manual)' }
];

const ACTION_TYPES = [
  { value: 'send_internal_notification', label: '💬 Send Internal Notification' },
  { value: 'add_tag', label: '🏷️ Add Customer Tag' },
  { value: 'remove_tag', label: '🏷️ Remove Customer Tag' },
  { value: 'add_segment', label: '👥 Add Segment' },
  { value: 'remove_segment', label: '👥 Remove Segment' },
  { value: 'create_admin_note', label: '📝 Create Admin Note' },
  { value: 'generate_coupon', label: '🎟️ Generate Coupon' },
  { value: 'apply_coupon', label: '🎟️ Apply Coupon' },
  { value: 'http_request', label: '🔌 Webhook / HTTP Request' },
  { value: 'execute_another_workflow', label: '⚡ Execute Another Workflow' },
  // Placeholders
  { value: 'whatsapp_placeholder', label: '📱 WhatsApp Campaign (Future)' },
  { value: 'email_placeholder', label: '📧 Email Marketing (Future)' },
  { value: 'sms_placeholder', label: '💬 SMS Blast (Future)' },
  { value: 'meta_audience_placeholder', label: '🎯 Meta Audience Sync (Future)' },
  { value: 'google_audience_placeholder', label: '🎯 Google Audience Sync (Future)' },
  { value: 'ai_action_placeholder', label: '🤖 AI Automation Agent (Future)' }
];

const CONDITION_FIELDS = [
  { value: 'ltv', label: 'Customer LTV (₹)' },
  { value: 'segment', label: 'Customer Segment' },
  { value: 'tag', label: 'Customer Tag' },
  { value: 'country', label: 'Country' },
  { value: 'order_value', label: 'Order Value (₹)' },
  { value: 'purchased_count', label: 'Order Purchase Count' },
  { value: 'has_whatsapp', label: 'Opt-in WhatsApp (true/false)' },
  { value: 'has_email', label: 'Opt-in Email (true/false)' },
  { value: 'category', label: 'Product Category' },
  { value: 'campaign_source', label: 'Campaign Source (UTM)' }
];

const CONDITION_OPERATORS = [
  { value: '==', label: 'equals' },
  { value: '!=', label: 'not equals' },
  { value: '>', label: 'greater than' },
  { value: '>=', label: 'greater or equal' },
  { value: '<', label: 'less than' },
  { value: '<=', label: 'less or equal' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'not contains' },
  { value: 'in', label: 'in list (comma separated)' }
];

export default function VisualEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id: workflowId } = use(params);

  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Selection / configuration side drawer
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedTrigger, setSelectedTrigger] = useState(false);

  // List of other workflows (for the sub-workflow action)
  const [otherWorkflows, setOtherWorkflows] = useState<any[]>([]);

  useEffect(() => {
    fetchWorkflowDetails();
    fetchOtherWorkflows();
  }, [workflowId]);

  const fetchWorkflowDetails = async () => {
    try {
      const res = await fetch(`/api/admin/automation/workflows/${workflowId}`);
      if (!res.ok) throw new Error('Workflow not found');
      const data = await res.json();
      if (data.success && data.workflow) {
        setWorkflow(data.workflow);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to load workflow details');
      router.push('/admin/automation');
    } finally {
      setLoading(false);
    }
  };

  const fetchOtherWorkflows = async () => {
    try {
      const res = await fetch('/api/admin/automation/workflows');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setOtherWorkflows((data.workflows || []).filter((w: any) => w.id !== workflowId));
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveWorkflow = async () => {
    if (!workflow) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/automation/workflows/${workflowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: workflow.name,
          description: workflow.description,
          trigger_type: workflow.trigger_type,
          definition: workflow.definition
        })
      });

      if (!res.ok) throw new Error('Failed to save');
      const data = await res.json();
      if (data.success) {
        alert('Workflow configuration saved successfully.');
      }
    } catch (err: any) {
      alert(err.message || 'Error saving workflow');
    } finally {
      setSaving(false);
    }
  };

  // Node editing actions
  const getSelectedNode = () => {
    if (!workflow || !selectedNodeId) return null;
    return workflow.definition.nodes[selectedNodeId] || null;
  };

  const updateSelectedNodeConfig = (updatedConfig: any) => {
    if (!workflow || !selectedNodeId) return;
    const nodes = { ...workflow.definition.nodes };
    nodes[selectedNodeId] = {
      ...nodes[selectedNodeId],
      config: updatedConfig
    };
    setWorkflow({
      ...workflow,
      definition: { ...workflow.definition, nodes }
    });
  };

  const updateSelectedNodeName = (name: string) => {
    if (!workflow || !selectedNodeId) return;
    const nodes = { ...workflow.definition.nodes };
    nodes[selectedNodeId] = {
      ...nodes[selectedNodeId],
      name
    };
    setWorkflow({
      ...workflow,
      definition: { ...workflow.definition, nodes }
    });
  };

  // Flow insertion operations
  const insertNode = (type: 'action' | 'condition' | 'delay', parentNodeId: string | 'trigger', branchType?: 'true' | 'false') => {
    if (!workflow) return;

    const newId = `node-${Date.now()}`;
    const def = { ...workflow.definition };
    const nodes = { ...def.nodes };

    let nextNodeTarget: string | null = null;

    if (parentNodeId === 'trigger') {
      nextNodeTarget = def.trigger.nextNodeId;
      def.trigger.nextNodeId = newId;
    } else {
      const parentNode = nodes[parentNodeId];
      if (parentNode.type === 'condition') {
        if (branchType === 'true') {
          nextNodeTarget = parentNode.trueNodeId || null;
          parentNode.trueNodeId = newId;
        } else {
          nextNodeTarget = parentNode.falseNodeId || null;
          parentNode.falseNodeId = newId;
        }
      } else {
        nextNodeTarget = parentNode.nextNodeId || null;
        parentNode.nextNodeId = newId;
      }
    }

    // Initialize new node details
    if (type === 'action') {
      nodes[newId] = {
        id: newId,
        type: 'action',
        name: 'New Action Block',
        config: {
          actionType: 'send_internal_notification',
          params: { title: 'Notification', body: 'Workflows output' }
        },
        nextNodeId: nextNodeTarget
      };
    } else if (type === 'condition') {
      nodes[newId] = {
        id: newId,
        type: 'condition',
        name: 'Check Criteria',
        config: {
          logicalOperator: 'AND',
          conditions: [
            { field: 'ltv', operator: '>=', value: '5000' }
          ]
        },
        trueNodeId: nextNodeTarget,
        falseNodeId: null
      };
    } else if (type === 'delay') {
      nodes[newId] = {
        id: newId,
        type: 'delay',
        name: 'Time Delay',
        config: {
          params: { duration: 1, unit: 'hours' }
        },
        nextNodeId: nextNodeTarget
      };
    }

    setWorkflow({
      ...workflow,
      definition: { ...def, nodes }
    });
    setSelectedNodeId(newId);
    setSelectedTrigger(false);
  };

  const deleteNode = (nodeId: string, parentNodeId: string | 'trigger', branchType?: 'true' | 'false') => {
    if (!workflow) return;

    const def = { ...workflow.definition };
    const nodes = { ...def.nodes };
    const targetNode = nodes[nodeId];

    if (!targetNode) return;

    let bypassTarget: string | null = null;
    if (targetNode.type === 'condition') {
      // For conditions, deleting the node connects the parent to the True branch nextNodeId
      bypassTarget = targetNode.trueNodeId || null;
    } else {
      bypassTarget = targetNode.nextNodeId || null;
    }

    if (parentNodeId === 'trigger') {
      def.trigger.nextNodeId = bypassTarget;
    } else {
      const parentNode = nodes[parentNodeId];
      if (parentNode.type === 'condition') {
        if (branchType === 'true') {
          parentNode.trueNodeId = bypassTarget;
        } else {
          parentNode.falseNodeId = bypassTarget;
        }
      } else {
        parentNode.nextNodeId = bypassTarget;
      }
    }

    delete nodes[nodeId];
    
    setWorkflow({
      ...workflow,
      definition: { ...def, nodes }
    });
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null);
    }
  };

  // Rendering engine of workflow nodes in visual stack
  const renderConnectionAdder = (parentNodeId: string | 'trigger', branchType?: 'true' | 'false') => {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div className={styles.connector}></div>
        <div style={{ position: 'relative', display: 'flex', gap: '8px', zIndex: 10 }}>
          <button 
            onClick={() => insertNode('action', parentNodeId, branchType)}
            className={styles.addNodeBtn}
            title="Add Action Node"
          >
            ⚡
          </button>
          <button 
            onClick={() => insertNode('condition', parentNodeId, branchType)}
            className={styles.addNodeBtn}
            title="Add Condition Node"
            style={{ fontSize: '0.85rem' }}
          >
            ❓
          </button>
          <button 
            onClick={() => insertNode('delay', parentNodeId, branchType)}
            className={styles.addNodeBtn}
            title="Add Delay Node"
            style={{ fontSize: '0.85rem' }}
          >
            ⏳
          </button>
        </div>
        <div className={styles.connector}></div>
      </div>
    );
  };

  const renderFlowNode = (nodeId: string | null, parentNodeId: string | 'trigger', branchType?: 'true' | 'false'): React.ReactNode => {
    if (!nodeId || !workflow) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ 
            border: '1px dashed var(--border-color)', 
            padding: '8px 16px', 
            borderRadius: '4px',
            fontSize: '0.75rem',
            color: 'var(--text-muted)'
          }}>
            🏁 End of branch
          </div>
        </div>
      );
    }

    const node = workflow.definition.nodes[nodeId];
    if (!node) return null;

    const isSelected = selectedNodeId === nodeId;

    let nodeClass = styles.actionNode;
    let nodeSymbol = '⚙️';
    if (node.type === 'condition') {
      nodeClass = styles.conditionNode;
      nodeSymbol = '❓';
    } else if (node.type === 'delay') {
      nodeClass = styles.delayNode;
      nodeSymbol = '⏳';
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
        {/* Node box element */}
        <div 
          className={`${styles.node} ${nodeClass} ${isSelected ? styles.nodeSelected : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            setSelectedNodeId(nodeId);
            setSelectedTrigger(false);
          }}
        >
          <div className={styles.nodeHeader}>
            <span className={styles.nodeTypeTag}>
              {nodeSymbol} {node.type}
            </span>
            <button 
              className={styles.nodeDeleteBtn}
              onClick={(e) => {
                e.stopPropagation();
                deleteNode(node.id, parentNodeId, branchType);
              }}
              title="Delete node"
            >
              ✕
            </button>
          </div>
          <div className={styles.nodeTitle}>{node.name}</div>
          <div className={styles.nodeDesc}>
            {node.type === 'action' && `${node.config?.actionType?.replace(/_/g, ' ').toUpperCase()}`}
            {node.type === 'condition' && `${node.config?.logicalOperator || 'AND'} (${node.config?.conditions?.length || 0} rules)`}
            {node.type === 'delay' && `Wait ${node.config?.params?.duration} ${node.config?.params?.unit}`}
          </div>
        </div>

        {/* Following components */}
        {node.type === 'condition' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
            <div className={styles.connector}></div>
            <div className={styles.branchesContainer}>
              {/* True/YES path column */}
              <div className={styles.branchColumn}>
                <span className={`${styles.branchLabel} ${styles.branchTrue}`}>Yes (True)</span>
                {renderConnectionAdder(node.id, 'true')}
                {renderFlowNode(node.trueNodeId || null, node.id, 'true')}
              </div>
              
              {/* False/NO path column */}
              <div className={styles.branchColumn}>
                <span className={styles.branchLabel}>No (False)</span>
                {renderConnectionAdder(node.id, 'false')}
                {renderFlowNode(node.falseNodeId || null, node.id, 'false')}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
            {renderConnectionAdder(node.id)}
            {renderFlowNode(node.nextNodeId || null, node.id)}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '300px', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
        LOADING VISUAL CANVAS EDITOR...
      </div>
    );
  }

  if (!workflow) return null;

  const activeNode = getSelectedNode();

  return (
    <div className={styles.container}>
      
      {/* Top action header bar */}
      <div className={styles.headerRow}>
        <div className={styles.titleSection}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Link href="/admin/automation" style={{ color: 'var(--accent-gold)', fontSize: '0.85rem' }}>
              ← Back to list
            </Link>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>/</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>FLOW BUILDER</span>
          </div>
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginTop: '4px' }}>
            <input 
              type="text" 
              value={workflow.name}
              onChange={(e) => setWorkflow({ ...workflow, name: e.target.value })}
              className={styles.input}
              style={{ fontSize: '1.25rem', padding: '4px 8px', fontWeight: 'bold', width: '320px', border: 'none', background: 'transparent' }}
            />
            <span className={`${styles.badge} ${workflow.is_active ? styles.badgeSuccess : styles.badgeInfo}`} style={{ fontSize: '10px' }}>
              {workflow.is_active ? 'Active' : 'Draft'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            onClick={handleSaveWorkflow} 
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={saving}
          >
            {saving ? 'Saving...' : '💾 Save Changes'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: activeNode || selectedTrigger ? '1fr 380px' : '1fr', gap: '20px', alignItems: 'start' }}>
        
        {/* Visual node flowchart workspace */}
        <div className={styles.canvas}>
          {/* Start Trigger block */}
          <div 
            className={`${styles.node} ${styles.triggerNode} ${selectedTrigger ? styles.nodeSelected : ''}`}
            onClick={() => {
              setSelectedTrigger(true);
              setSelectedNodeId(null);
            }}
          >
            <div className={styles.nodeHeader}>
              <span className={styles.nodeTypeTag}>🏁 TRIGGER</span>
            </div>
            <div className={styles.nodeTitle}>
              {TRIGGER_TYPES.find(t => t.value === workflow.trigger_type)?.label.split(' (')[0] || workflow.trigger_type}
            </div>
            <div className={styles.nodeDesc}>
              Event: <code style={{ color: 'var(--accent-gold)' }}>{workflow.trigger_type}</code>
            </div>
          </div>

          {/* Trigger connection list */}
          {renderConnectionAdder('trigger')}

          {/* Flows loop */}
          {renderFlowNode(workflow.definition.trigger.nextNodeId || null, 'trigger')}
        </div>

        {/* Configuration Right Sidebar Drawer */}
        {(activeNode || selectedTrigger) && (
          <div className={styles.sidebarDrawer}>
            <div className={styles.drawerHeader}>
              <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent-gold)', margin: 0 }}>
                🔧 Configure Block
              </h3>
              <button 
                onClick={() => {
                  setSelectedNodeId(null);
                  setSelectedTrigger(false);
                }}
                style={{ color: 'var(--text-muted)' }}
              >
                ✕ Close
              </button>
            </div>

            {/* Editing Trigger Block */}
            {selectedTrigger && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Trigger Event</label>
                  <select
                    value={workflow.trigger_type}
                    onChange={(e) => {
                      const trigger_type = e.target.value;
                      const def = { ...workflow.definition };
                      def.trigger.type = trigger_type;
                      setWorkflow({
                        ...workflow,
                        trigger_type,
                        definition: def
                      });
                    }}
                    className={styles.input}
                  >
                    {TRIGGER_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Workflow Description</label>
                  <textarea
                    value={workflow.description || ''}
                    onChange={(e) => setWorkflow({ ...workflow, description: e.target.value })}
                    className={styles.input}
                    style={{ height: '80px', resize: 'vertical' }}
                    placeholder="Describe what this automation accomplished..."
                  />
                </div>
              </div>
            )}

            {/* Editing Action Block */}
            {activeNode && activeNode.type === 'action' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Block Display Name</label>
                  <input
                    type="text"
                    value={activeNode.name}
                    onChange={(e) => updateSelectedNodeName(e.target.value)}
                    className={styles.input}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Action Operation</label>
                  <select
                    value={activeNode.config.actionType}
                    onChange={(e) => {
                      const val = e.target.value;
                      // reset parameters based on choice
                      const config = { actionType: val, params: {} };
                      if (val === 'send_internal_notification') {
                        config.params = { title: 'Alert', body: 'Details' };
                      } else if (val === 'add_tag' || val === 'remove_tag') {
                        config.params = { tag: 'VIP' };
                      } else if (val === 'add_segment' || val === 'remove_segment') {
                        config.params = { segment: 'VIP' };
                      } else if (val === 'create_admin_note') {
                        config.params = { content: 'Note text' };
                      } else if (val === 'generate_coupon') {
                        config.params = { codePrefix: 'OFF', discountPercent: 10, expiryHours: 24 };
                      } else if (val === 'apply_coupon') {
                        config.params = { couponCode: '' };
                      } else if (val === 'http_request') {
                        config.params = { url: 'https://', method: 'POST', body: '' };
                      } else if (val === 'execute_another_workflow') {
                        config.params = { workflowId: '' };
                      }
                      updateSelectedNodeConfig(config);
                    }}
                    className={styles.input}
                  >
                    {ACTION_TYPES.map(a => (
                      <option key={a.value} value={a.value}>{a.label}</option>
                    ))}
                  </select>
                </div>

                {/* Sub configuration options for action parameters */}
                {activeNode.config.actionType === 'send_internal_notification' && (
                  <>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Notification Title</label>
                      <input
                        type="text"
                        value={activeNode.config.params.title || ''}
                        onChange={(e) => updateSelectedNodeConfig({
                          ...activeNode.config,
                          params: { ...activeNode.config.params, title: e.target.value }
                        })}
                        className={styles.input}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Notification Message Body</label>
                      <textarea
                        value={activeNode.config.params.body || ''}
                        onChange={(e) => updateSelectedNodeConfig({
                          ...activeNode.config,
                          params: { ...activeNode.config.params, body: e.target.value }
                        })}
                        className={styles.input}
                        style={{ height: '80px', resize: 'vertical' }}
                        placeholder="Can use template tokens like {{ customer.email }} or {{ payload.properties.price }}"
                      />
                    </div>
                  </>
                )}

                {(activeNode.config.actionType === 'add_tag' || activeNode.config.actionType === 'remove_tag') && (
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Tag Name</label>
                    <input
                      type="text"
                      value={activeNode.config.params.tag || ''}
                      onChange={(e) => updateSelectedNodeConfig({
                        ...activeNode.config,
                        params: { ...activeNode.config.params, tag: e.target.value }
                      })}
                      className={styles.input}
                      placeholder="e.g. VIP, Repeat Purchaser"
                    />
                  </div>
                )}

                {(activeNode.config.actionType === 'add_segment' || activeNode.config.actionType === 'remove_segment') && (
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Segment Name</label>
                    <input
                      type="text"
                      value={activeNode.config.params.segment || ''}
                      onChange={(e) => updateSelectedNodeConfig({
                        ...activeNode.config,
                        params: { ...activeNode.config.params, segment: e.target.value }
                      })}
                      className={styles.input}
                      placeholder="e.g. VIP, New Customer"
                    />
                  </div>
                )}

                {activeNode.config.actionType === 'create_admin_note' && (
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Note Content</label>
                    <textarea
                      value={activeNode.config.params.content || ''}
                      onChange={(e) => updateSelectedNodeConfig({
                        ...activeNode.config,
                        params: { ...activeNode.config.params, content: e.target.value }
                      })}
                      className={styles.input}
                      style={{ height: '80px', resize: 'vertical' }}
                      placeholder="Supports tokens like {{ customer.email }}..."
                    />
                  </div>
                )}

                {activeNode.config.actionType === 'generate_coupon' && (
                  <>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Coupon Prefix</label>
                      <input
                        type="text"
                        value={activeNode.config.params.codePrefix || ''}
                        onChange={(e) => updateSelectedNodeConfig({
                          ...activeNode.config,
                          params: { ...activeNode.config.params, codePrefix: e.target.value }
                        })}
                        className={styles.input}
                        placeholder="e.g. OFF"
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Discount Percent (%)</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={activeNode.config.params.discountPercent || 10}
                        onChange={(e) => updateSelectedNodeConfig({
                          ...activeNode.config,
                          params: { ...activeNode.config.params, discountPercent: Number(e.target.value) }
                        })}
                        className={styles.input}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Expiry Window (Hours)</label>
                      <input
                        type="number"
                        min="1"
                        value={activeNode.config.params.expiryHours || 24}
                        onChange={(e) => updateSelectedNodeConfig({
                          ...activeNode.config,
                          params: { ...activeNode.config.params, expiryHours: Number(e.target.value) }
                        })}
                        className={styles.input}
                      />
                    </div>
                  </>
                )}

                {activeNode.config.actionType === 'apply_coupon' && (
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Coupon Code</label>
                    <input
                      type="text"
                      value={activeNode.config.params.couponCode || ''}
                      onChange={(e) => updateSelectedNodeConfig({
                        ...activeNode.config,
                        params: { ...activeNode.config.params, couponCode: e.target.value }
                      })}
                      className={styles.input}
                      placeholder="Blank to apply previous node's generated code"
                    />
                  </div>
                )}

                {activeNode.config.actionType === 'http_request' && (
                  <>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Webhook Target URL</label>
                      <input
                        type="text"
                        value={activeNode.config.params.url || ''}
                        onChange={(e) => updateSelectedNodeConfig({
                          ...activeNode.config,
                          params: { ...activeNode.config.params, url: e.target.value }
                        })}
                        className={styles.input}
                        placeholder="https://your-endpoint.com/webhook"
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Method</label>
                      <select
                        value={activeNode.config.params.method || 'POST'}
                        onChange={(e) => updateSelectedNodeConfig({
                          ...activeNode.config,
                          params: { ...activeNode.config.params, method: e.target.value }
                        })}
                        className={styles.input}
                      >
                        <option value="POST">POST</option>
                        <option value="GET">GET</option>
                        <option value="PUT">PUT</option>
                      </select>
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Payload Body JSON</label>
                      <textarea
                        value={activeNode.config.params.body || ''}
                        onChange={(e) => updateSelectedNodeConfig({
                          ...activeNode.config,
                          params: { ...activeNode.config.params, body: e.target.value }
                        })}
                        className={styles.input}
                        style={{ height: '80px', resize: 'vertical', fontFamily: 'monospace', fontSize: '0.75rem' }}
                        placeholder="Blank for default payload JSON"
                      />
                    </div>
                  </>
                )}

                {activeNode.config.actionType === 'execute_another_workflow' && (
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Target Workflow</label>
                    <select
                      value={activeNode.config.params.workflowId || ''}
                      onChange={(e) => updateSelectedNodeConfig({
                        ...activeNode.config,
                        params: { ...activeNode.config.params, workflowId: e.target.value }
                      })}
                      className={styles.input}
                    >
                      <option value="">Select a workflow...</option>
                      {otherWorkflows.map(w => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Editing Condition Block */}
            {activeNode && activeNode.type === 'condition' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Block Display Name</label>
                  <input
                    type="text"
                    value={activeNode.name}
                    onChange={(e) => updateSelectedNodeName(e.target.value)}
                    className={styles.input}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Logical Join Operator</label>
                  <select
                    value={activeNode.config.logicalOperator || 'AND'}
                    onChange={(e) => updateSelectedNodeConfig({
                      ...activeNode.config,
                      logicalOperator: e.target.value
                    })}
                    className={styles.input}
                  >
                    <option value="AND">AND (All rules must match)</option>
                    <option value="OR">OR (At least one match)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label className={styles.label}>Rule Statements</label>
                  {(activeNode.config.conditions || []).map((cond: any, idx: number) => (
                    <div 
                      key={idx} 
                      style={{ 
                        border: '1px solid var(--border-color)', 
                        padding: '10px', 
                        borderRadius: '6px', 
                        background: 'rgba(0,0,0,0.1)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--accent-gold)' }}>Rule #{idx+1}</span>
                        <button
                          onClick={() => {
                            const newConds = activeNode.config.conditions.filter((_: any, i: number) => i !== idx);
                            updateSelectedNodeConfig({ ...activeNode.config, conditions: newConds });
                          }}
                          style={{ color: 'var(--error)', fontSize: '0.7rem' }}
                        >
                          Remove
                        </button>
                      </div>
                      
                      <div className={styles.formGroup}>
                        <select
                          value={cond.field}
                          onChange={(e) => {
                            const updated = [...activeNode.config.conditions];
                            updated[idx] = { ...updated[idx], field: e.target.value };
                            updateSelectedNodeConfig({ ...activeNode.config, conditions: updated });
                          }}
                          className={styles.input}
                          style={{ padding: '4px', fontSize: '0.75rem' }}
                        >
                          {CONDITION_FIELDS.map(f => (
                            <option key={f.value} value={f.value}>{f.label}</option>
                          ))}
                        </select>
                      </div>

                      <div className={styles.formGroup}>
                        <select
                          value={cond.operator}
                          onChange={(e) => {
                            const updated = [...activeNode.config.conditions];
                            updated[idx] = { ...updated[idx], operator: e.target.value };
                            updateSelectedNodeConfig({ ...activeNode.config, conditions: updated });
                          }}
                          className={styles.input}
                          style={{ padding: '4px', fontSize: '0.75rem' }}
                        >
                          {CONDITION_OPERATORS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>

                      <div className={styles.formGroup}>
                        <input
                          type="text"
                          value={cond.value || ''}
                          onChange={(e) => {
                            const updated = [...activeNode.config.conditions];
                            updated[idx] = { ...updated[idx], value: e.target.value };
                            updateSelectedNodeConfig({ ...activeNode.config, conditions: updated });
                          }}
                          className={styles.input}
                          style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                          placeholder="value"
                        />
                      </div>
                    </div>
                  ))}

                  <button
                    onClick={() => {
                      const updated = [...(activeNode.config.conditions || []), { field: 'ltv', operator: '>=', value: '5000' }];
                      updateSelectedNodeConfig({ ...activeNode.config, conditions: updated });
                    }}
                    className={styles.btn}
                    style={{ width: '100%', padding: '6px', fontSize: '0.75rem', borderStyle: 'dashed' }}
                  >
                    ➕ Add Statement Rule
                  </button>
                </div>
              </div>
            )}

            {/* Editing Delay Block */}
            {activeNode && activeNode.type === 'delay' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Block Display Name</label>
                  <input
                    type="text"
                    value={activeNode.name}
                    onChange={(e) => updateSelectedNodeName(e.target.value)}
                    className={styles.input}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Duration Value</label>
                  <input
                    type="number"
                    min="1"
                    value={activeNode.config.params.duration || 1}
                    onChange={(e) => updateSelectedNodeConfig({
                      ...activeNode.config,
                      params: { ...activeNode.config.params, duration: Number(e.target.value) }
                    })}
                    className={styles.input}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Time Unit</label>
                  <select
                    value={activeNode.config.params.unit || 'hours'}
                    onChange={(e) => updateSelectedNodeConfig({
                      ...activeNode.config,
                      params: { ...activeNode.config.params, unit: e.target.value }
                    })}
                    className={styles.input}
                  >
                    <option value="minutes">Minutes</option>
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
