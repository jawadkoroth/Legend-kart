export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  trigger_type: string;
  definition: {
    trigger: {
      type: string;
      nextNodeId: string | null;
    };
    nodes: Record<string, any>;
  };
}

export const WORKFLOW_TEMPLATES: Record<string, WorkflowTemplate> = {
  welcome_customer: {
    id: 'welcome_customer',
    name: 'Welcome Customer Campaign',
    description: 'Triggered when a guest completes registration. Automatically tags them and schedules a welcome email/notification.',
    trigger_type: 'registration_completed',
    definition: {
      trigger: {
        type: 'registration_completed',
        nextNodeId: 'tag-customer'
      },
      nodes: {
        'tag-customer': {
          id: 'tag-customer',
          type: 'action',
          name: 'Tag New Customer',
          config: {
            actionType: 'add_tag',
            params: {
              tag: 'New Customer'
            }
          },
          nextNodeId: 'send-welcome'
        },
        'send-welcome': {
          id: 'send-welcome',
          type: 'action',
          name: 'Send Welcome Notification',
          config: {
            actionType: 'send_internal_notification',
            params: {
              title: '👋 Welcome to Noir!',
              body: 'Welcome customer {{customer.name}} ({{customer.email}}) to the PANTHER CRM ecosystem. Sending welcome email mock.'
            }
          },
          nextNodeId: null
        }
      }
    }
  },
  cart_abandonment: {
    id: 'cart_abandonment',
    name: 'Cart Abandonment Recovery',
    description: 'Triggered when checkout is started. Delays for 1 hour, checks if payment was succeeded, and alerts admin / sends recovery code.',
    trigger_type: 'checkout_started',
    definition: {
      trigger: {
        type: 'checkout_started',
        nextNodeId: 'delay-recovery'
      },
      nodes: {
        'delay-recovery': {
          id: 'delay-recovery',
          type: 'delay',
          name: 'Wait 1 Hour',
          config: {
            params: {
              duration: 60,
              unit: 'minutes'
            }
          },
          nextNodeId: 'check-purchase'
        },
        'check-purchase': {
          id: 'check-purchase',
          type: 'condition',
          name: 'Has Not Purchased?',
          config: {
            logicalOperator: 'AND',
            conditions: [
              {
                field: 'purchased_count',
                operator: '==',
                value: '0'
              }
            ]
          },
          trueNodeId: 'send-recovery-offer',
          falseNodeId: null
        },
        'send-recovery-offer': {
          id: 'send-recovery-offer',
          type: 'action',
          name: 'Generate Recovery Coupon',
          config: {
            actionType: 'generate_coupon',
            params: {
              codePrefix: 'CART',
              discountPercent: 10,
              expiryHours: 24
            }
          },
          nextNodeId: 'apply-recovery-coupon'
        },
        'apply-recovery-coupon': {
          id: 'apply-recovery-coupon',
          type: 'action',
          name: 'Apply Coupon & Email Customer',
          config: {
            actionType: 'apply_coupon',
            params: {}
          },
          nextNodeId: 'notify-admin-abandon'
        },
        'notify-admin-abandon': {
          id: 'notify-admin-abandon',
          type: 'action',
          name: 'Notify Recovery Team',
          config: {
            actionType: 'send_internal_notification',
            params: {
              title: '🛒 Cart Abandonment Recovery',
              body: 'Customer {{customer.email}} abandoned checkout. Coupon code {{state.lastGeneratedCouponCode}} applied for recovery.'
            }
          },
          nextNodeId: null
        }
      }
    }
  },
  vip_customer: {
    id: 'vip_customer',
    name: 'VIP Customer Retention',
    description: 'Triggered on successful order payment. If customer Lifetime Value (LTV) exceeds ₹10,000, tag them VIP, add them to VIP cohort, and apply a 20% coupon code.',
    trigger_type: 'order_paid',
    definition: {
      trigger: {
        type: 'order_paid',
        nextNodeId: 'check-ltv'
      },
      nodes: {
        'check-ltv': {
          id: 'check-ltv',
          type: 'condition',
          name: 'LTV >= ₹10,000?',
          config: {
            logicalOperator: 'AND',
            conditions: [
              {
                field: 'ltv',
                operator: '>=',
                value: '10000'
              }
            ]
          },
          trueNodeId: 'tag-vip',
          falseNodeId: null
        },
        'tag-vip': {
          id: 'tag-vip',
          type: 'action',
          name: 'Tag VIP Customer',
          config: {
            actionType: 'add_tag',
            params: {
              tag: 'VIP'
            }
          },
          nextNodeId: 'segment-vip'
        },
        'segment-vip': {
          id: 'segment-vip',
          type: 'action',
          name: 'Add to VIP Cohort',
          config: {
            actionType: 'add_segment',
            params: {
              segment: 'VIP'
            }
          },
          nextNodeId: 'generate-vip-gift'
        },
        'generate-vip-gift': {
          id: 'generate-vip-gift',
          type: 'action',
          name: 'Generate 20% Gift Coupon',
          config: {
            actionType: 'generate_coupon',
            params: {
              codePrefix: 'VIPGIFT',
              discountPercent: 20,
              expiryHours: 72
            }
          },
          nextNodeId: 'apply-vip-gift'
        },
        'apply-vip-gift': {
          id: 'apply-vip-gift',
          type: 'action',
          name: 'Apply Gift to Profile',
          config: {
            actionType: 'apply_coupon',
            params: {}
          },
          nextNodeId: 'notify-vip-welcome'
        },
        'notify-vip-welcome': {
          id: 'notify-vip-welcome',
          type: 'action',
          name: 'Alert Concierge & Email Customer',
          config: {
            actionType: 'send_internal_notification',
            params: {
              title: '💎 VIP Onboarding Alert',
              body: 'Customer {{customer.email}} reached VIP tier. Generated and applied 20% code: {{state.lastGeneratedCouponCode}}.'
            }
          },
          nextNodeId: null
        }
      }
    }
  },
  request_review: {
    id: 'request_review',
    name: 'Post-Delivery Product Review Request',
    description: 'Triggered when order shipment is completed. Delays 7 days, then checks customer engagement and prompts for a feedback review.',
    trigger_type: 'order_delivered',
    definition: {
      trigger: {
        type: 'order_delivered',
        nextNodeId: 'wait-7-days'
      },
      nodes: {
        'wait-7-days': {
          id: 'wait-7-days',
          type: 'delay',
          name: 'Wait 7 Days',
          config: {
            params: {
              duration: 7,
              unit: 'days'
            }
          },
          nextNodeId: 'send-review-email'
        },
        'send-review-email': {
          id: 'send-review-email',
          type: 'action',
          name: 'Send Review Request Notification',
          config: {
            actionType: 'send_internal_notification',
            params: {
              title: '⭐ Request Review',
              body: 'Order Delivered 7 days ago. Requesting review from customer {{customer.name}} ({{customer.email}}) for order items.'
            }
          },
          nextNodeId: null
        }
      }
    }
  },
  repeat_purchase_reminder: {
    id: 'repeat_purchase_reminder',
    name: 'Repeat Purchase Retargeting',
    description: 'Triggered 30 days after a successful order. Checks if the customer has placed any new orders. If not, issues a coupon code and invites them to shop again.',
    trigger_type: 'order_paid',
    definition: {
      trigger: {
        type: 'order_paid',
        nextNodeId: 'wait-30-days'
      },
      nodes: {
        'wait-30-days': {
          id: 'wait-30-days',
          type: 'delay',
          name: 'Wait 30 Days',
          config: {
            params: {
              duration: 30,
              unit: 'days'
            }
          },
          nextNodeId: 'check-activity'
        },
        'check-activity': {
          id: 'check-activity',
          type: 'condition',
          name: 'Only 1 Order in Total?',
          config: {
            logicalOperator: 'AND',
            conditions: [
              {
                field: 'purchased_count',
                operator: '==',
                value: '1'
              }
            ]
          },
          trueNodeId: 'send-winback-offer',
          falseNodeId: null
        },
        'send-winback-offer': {
          id: 'send-winback-offer',
          type: 'action',
          name: 'Generate 15% Win-back Code',
          config: {
            actionType: 'generate_coupon',
            params: {
              codePrefix: 'BACK',
              discountPercent: 15,
              expiryHours: 72
            }
          },
          nextNodeId: 'apply-winback'
        },
        'apply-winback': {
          id: 'apply-winback',
          type: 'action',
          name: 'Apply Win-back Coupon',
          config: {
            actionType: 'apply_coupon',
            params: {}
          },
          nextNodeId: 'send-winback-alert'
        },
        'send-winback-alert': {
          id: 'send-winback-alert',
          type: 'action',
          name: 'Send Win-back Notification',
          config: {
            actionType: 'send_internal_notification',
            params: {
              title: '🎯 Repeat Purchase Winback Campaign',
              body: 'Customer {{customer.email}} has not ordered in 30 days. WINBACK coupon code applied: {{state.lastGeneratedCouponCode}}.'
            }
          },
          nextNodeId: null
        }
      }
    }
  },
  birthday_campaign: {
    id: 'birthday_campaign',
    name: 'Customer Birthday Special (Placeholder)',
    description: 'Triggered via a scheduled calendar check on customer birthdays. Emails birthday greeting and a discount gift coupon.',
    trigger_type: 'manual',
    definition: {
      trigger: {
        type: 'manual',
        nextNodeId: 'greet-birthday'
      },
      nodes: {
        'greet-birthday': {
          id: 'greet-birthday',
          type: 'action',
          name: 'Send Birthday Greet Alert',
          config: {
            actionType: 'send_internal_notification',
            params: {
              title: '🎉 Happy Birthday!',
              body: 'Placeholder action triggered for customer {{customer.name}} ({{customer.email}}). Happy birthday greeting!'
            }
          },
          nextNodeId: null
        }
      }
    }
  },
  shipment_delivered_followup: {
    id: 'shipment_delivered_followup',
    name: 'Shipment Delivery Feedback Follow-up',
    description: 'Triggered when order shipment is delivered. Delays 1 day, then notifies customer service to follow up on satisfaction.',
    trigger_type: 'order_delivered',
    definition: {
      trigger: {
        type: 'order_delivered',
        nextNodeId: 'wait-24-hours'
      },
      nodes: {
        'wait-24-hours': {
          id: 'wait-24-hours',
          type: 'delay',
          name: 'Wait 24 Hours',
          config: {
            params: {
              duration: 24,
              unit: 'hours'
            }
          },
          nextNodeId: 'satisfaction-followup'
        },
        'satisfaction-followup': {
          id: 'satisfaction-followup',
          type: 'action',
          name: 'Send Support Satisfaction Alert',
          config: {
            actionType: 'send_internal_notification',
            params: {
              title: '🚚 Delivery Feedback Check',
              body: 'Order was delivered 24 hours ago. Follow up with {{customer.name}} ({{customer.email}}) to ensure full satisfaction.'
            }
          },
          nextNodeId: null
        }
      }
    }
  }
};
