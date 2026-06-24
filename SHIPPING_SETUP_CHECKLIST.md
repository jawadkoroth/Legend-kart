# Shipping Setup Checklist

## Required Configuration in Admin UI

Go to `/admin/shipping` and complete these steps:

### 1. Enable Provider
- [ ] Toggle **Provider Enabled** to ON
- [ ] Select **Delhivery** as the provider

### 2. API Configuration
- [ ] Set **API URL** to: `https://track.delhivery.com`
- [ ] Add your **Delhivery API Key** (get from Delhivery One dashboard)

### 3. Pickup Location
- [ ] **Pickup Name**: Exact name as registered in Delhivery One
- [ ] **Pickup Phone**: Your business phone number
- [ ] **Pickup Address Line 1**: Your pickup address
- [ ] **Pickup City**: Your city
- [ ] **Pickup State**: Your state  
- [ ] **Pickup Pincode**: Your PIN code

### 4. Save Settings
- [ ] Click **Save Changes** button

## Getting Delhivery API Credentials

1. Login to [Delhivery One](https://track.delhivery.com)
2. Go to Settings → API Integration
3. Generate/View your API Key
4. Ensure your pickup location is registered in Delhivery One

## Testing

After configuration:
1. Click **TEST CONNECTION** button - should show "Connected" status
2. Try creating a shipment for a confirmed order
3. Check if tracking ID appears in order details

## Common Issues

- **"Pickup location not found"**: Pickup name must match exactly in Delhivery One
- **"API key invalid"**: Regenerate API key in Delhivery One dashboard
- **"Provider not enabled"**: Toggle Provider Enabled to ON in admin UI
- **No tracking ID appears**: Ensure order status is "confirmed" before creating shipment

## Environment Variables (Optional)

If using new provider system, add to `.env.local`:
```
SHIPPING_NEW_PROVIDER_PIPE=on
```

Currently using legacy system (no env vars needed).
