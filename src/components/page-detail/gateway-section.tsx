import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { PaymentGatewayInfo } from '@/types/gateway';

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface GatewaySectionProps {
  gateway: PaymentGatewayInfo;
}

export function GatewaySection({ gateway }: GatewaySectionProps) {
  // Badge variant based on detection state
  const gatewayBadgeVariant =
    gateway.detectionState === 'gateway-found'
      ? ('default' as const)
      : gateway.detectionState === 'inconclusive'
        ? ('destructive' as const)
        : ('secondary' as const);

  // Format the primary gateway label
  const isValidGateway = (g: string) => g && !['na', 'n/a', ''].includes(g.toLowerCase());

  const gatewayLabel =
    gateway.detectionState === 'gateway-found' && isValidGateway(gateway.primaryGateway)
      ? capitalize(gateway.primaryGateway)
      : gateway.detectionState === 'vgs-only'
        ? 'VGS-only'
        : 'Inconclusive';

  // Wallet flags for iteration
  const walletFlags = [
    { label: 'Apple Pay', enabled: gateway.hasApplePay },
    { label: 'Google Pay', enabled: gateway.hasGooglePay },
    { label: 'PayPal', enabled: gateway.hasPayPal },
    { label: 'Venmo', enabled: gateway.hasVenmo },
  ];

  const hasAnyWalletFlag = walletFlags.some((w) => w.enabled);
  const showWalletSection = hasAnyWalletFlag || gateway.detectionState === 'gateway-found';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Gateway</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Gateway Type */}
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Gateway Type</h3>
          <Badge variant={gatewayBadgeVariant}>{gatewayLabel}</Badge>
          {gateway.detectionState === 'inconclusive' && gateway.inconclusiveReason && (
            <p className="text-sm text-muted-foreground mt-1">{gateway.inconclusiveReason}</p>
          )}
        </div>

        {/* Payment Methods */}
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">
            Accepted Payment Methods
          </h3>
          {gateway.paymentMethods.filter((m) => m && !['na', 'n/a', ''].includes(m.toLowerCase()))
            .length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {gateway.paymentMethods
                .filter((m) => m && !['na', 'n/a', ''].includes(m.toLowerCase()))
                .map((method, index) => (
                  <Badge key={index} variant="outline">
                    {capitalize(method)}
                  </Badge>
                ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">No payment methods detected</p>
          )}
        </div>

        {/* Digital Wallets */}
        {showWalletSection && (
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              Digital Wallet Support
            </h3>
            <div className="flex flex-wrap gap-2">
              {walletFlags.map((wallet) => (
                <Badge key={wallet.label} variant={wallet.enabled ? 'default' : 'outline'}>
                  {wallet.label}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Technical Details */}
        <div className="space-y-1">
          {gateway.vgsEnvironment && (
            <p className="text-xs text-muted-foreground">
              VGS Environment: {capitalize(gateway.vgsEnvironment)}
            </p>
          )}
          {gateway.hasStripeWalletButtons && (
            <p className="text-xs text-muted-foreground">Stripe wallet buttons detected</p>
          )}
          {gateway.hasVgsCollectFrame && (
            <p className="text-xs text-muted-foreground">VGS Collect iframe detected</p>
          )}
          <p className="text-xs text-muted-foreground">
            Detected:{' '}
            {new Date(gateway.detectedAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
