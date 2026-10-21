# Razorpay refund policy: manager approval, up to Rs 5,000

Draft for review. Not approved, and not in production.

- Policy id `razorpay-refund-manager-approved`, version `1.0.0`.
- Each refund needs a signed manager approval for the payment and amount, in `signals.approvalArtifact`.
- Refunds above Rs 5,000 (500000 paise) are refused.
- The caller must hold an authority grant in force for `razorpay:refund`, with the same limit.

To go live: propose the policy through the maker-checker flow, have a listed checker approve it, and register the manager's approver key. The grant must be created with the Rs 5,000 limit.
