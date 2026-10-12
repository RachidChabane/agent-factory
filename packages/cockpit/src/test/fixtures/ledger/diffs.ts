import { add, createdFile, ctx, del, editedFile, hunk } from '../patch.ts';
import type { PatchedFile } from '../patch.ts';
import { CHECK_PATH, DOCS_PATH } from './paths.ts';

export const INVOICE_LIFECYCLE_FILES: readonly PatchedFile[] = [
  createdFile(DOCS_PATH, [
    '# Invoice lifecycle',
    '',
    'An invoice is a `draft` until it is issued, then `issued` until it is paid or voided.',
    '',
    '| From | Event | To |',
    '| --- | --- | --- |',
    '| draft | `issue` | issued |',
    '| issued | `payment_received` | paid |',
    '| issued | `void` | void |',
    '| draft | `discard` | void |',
    '',
    'The transitions are implemented in `src/ledger/billing/lifecycle.py`.',
  ]),
];

export const IDEMPOTENCY_FILES: readonly PatchedFile[] = [
  editedFile('src/ledger/payments/create.py', [
    hunk(
      12,
      [
        ctx('def create_payment(request: PaymentRequest, store: PaymentStore) -> Payment:'),
        del('    payment = Payment.from_request(request)'),
        add('    if request.idempotency_key is not None:'),
        add('        existing = store.find_by_idempotency_key(request.idempotency_key)'),
        add('        if existing is not None:'),
        add('            ensure_same_request(existing, request)'),
        add('            return existing'),
        add('    payment = Payment.from_request(request)'),
        ctx('    store.save(payment)'),
        ctx('    return payment'),
      ],
      'from ledger.payments.model import Payment',
    ),
  ]),
  createdFile('src/ledger/payments/idempotency.py', [
    'from ledger.errors import Conflict',
    'from ledger.payments.model import Payment, PaymentRequest',
    '',
    '',
    'def ensure_same_request(existing: Payment, request: PaymentRequest) -> None:',
    '    if existing.fingerprint != request.fingerprint():',
    '        raise Conflict("the idempotency key was used with a different request")',
  ]),
  createdFile(CHECK_PATH.idempotency, [
    'def test_replaying_a_request_returns_the_first_payment(client):',
    '    first = client.post("/payments", json=PAYMENT, headers={"Idempotency-Key": "k-1"})',
    '    second = client.post("/payments", json=PAYMENT, headers={"Idempotency-Key": "k-1"})',
    '    assert second.json()["id"] == first.json()["id"]',
    '',
    '',
    'def test_reusing_a_key_with_another_body_is_refused(client):',
    '    client.post("/payments", json=PAYMENT, headers={"Idempotency-Key": "k-2"})',
    '    other = client.post("/payments", json={**PAYMENT, "amount_cents": 900}, headers={"Idempotency-Key": "k-2"})',
    '    assert other.status_code == 409',
  ]),
];

export const TAX_ROUNDING_FILES: readonly PatchedFile[] = [
  editedFile('src/ledger/billing/tax.py', [
    hunk(
      21,
      [
        ctx('def invoice_tax(lines: list[InvoiceLine]) -> int:'),
        del('    return round(sum(line.net_cents * line.tax_rate for line in lines))'),
        add('    return sum(line_tax(line) for line in lines)'),
        ctx(''),
        add(''),
        add('def line_tax(line: InvoiceLine) -> int:'),
        add('    return int((line.net_cents * line.tax_rate_basis_points + HALF_BASIS_POINT) // BASIS_POINTS)'),
      ],
      'from ledger.billing.model import InvoiceLine',
    ),
  ]),
  editedFile(CHECK_PATH.taxRounding, [
    hunk(
      9,
      [
        ctx('def test_single_line_invoice_is_unchanged():'),
        ctx('    assert invoice_tax([line(1000, 2000)]) == 200'),
        add(''),
        add(''),
        add('def test_tax_is_rounded_per_line_before_summing():'),
        add('    lines = [line(333, 2000), line(333, 2000), line(334, 2000)]'),
        add('    assert invoice_tax(lines) == 67 + 67 + 67'),
      ],
      'from ledger.billing.tax import invoice_tax',
    ),
  ]),
];

export const WEBHOOK_SIGNATURE_PATH = 'src/ledger/webhooks/signing.py';
export const WEBHOOK_CANDIDATES_LINE = 25;

export const WEBHOOK_SIGNATURE_FILES: readonly PatchedFile[] = [
  editedFile(WEBHOOK_SIGNATURE_PATH, [
    hunk(
      24,
      [
        ctx('def verify(body: bytes, signature: str, secrets: Secrets) -> bool:'),
        del('    expected = sign(body, secrets.current)'),
        del('    return expected == signature'),
        add('    candidates = [secrets.current, secrets.previous] if secrets.previous else [secrets.current]'),
        add('    return any(hmac.compare_digest(sign(body, secret), signature) for secret in candidates)'),
        ctx(''),
      ],
      'import hmac',
    ),
  ]),
  editedFile('src/ledger/webhooks/receive.py', [
    hunk(
      15,
      [
        ctx('async def receive(request: Request) -> Response:'),
        ctx('    body = await request.body()'),
        del('    if not verify(body, request.headers.get("X-Signature", ""), SECRETS):'),
        add('    if not verify(body, request.headers.get("X-Signature", ""), secrets_from(request.app.state)):'),
        ctx('        return Response(status_code=401)'),
      ],
      'from ledger.webhooks.signing import verify',
    ),
  ]),
  createdFile(CHECK_PATH.webhookSignatures, [
    'def test_a_forged_signature_is_refused(client):',
    '    response = client.post("/webhooks/payments", content=BODY, headers={"X-Signature": forged(BODY)})',
    '    assert response.status_code == 401',
    '',
    '',
    'def test_the_previous_secret_is_still_accepted(client_with_rotation):',
    '    response = client_with_rotation.post("/webhooks/payments", content=BODY, headers={"X-Signature": signed_with_previous(BODY)})',
    '    assert response.status_code == 202',
  ]),
];
