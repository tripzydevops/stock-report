import unittest
from datetime import date
from scripts.sync_bist_kap_dividends import (
    KapDividendDeclaration,
    calculate_bist_t_plus_2_settlement,
    is_bist_holiday,
)

class TestDividendCashLedgerBoundary(unittest.TestCase):
    def test_python_t_plus_2_settlement_skips_weekends(self):
        """Thursday 2026-11-26 ex-date must settle on Monday 2026-11-30."""
        ex_date = date(2026, 11, 26)
        pay_date = calculate_bist_t_plus_2_settlement(ex_date)
        self.assertEqual(pay_date, date(2026, 11, 30))

    def test_python_t_plus_2_settlement_skips_religious_holidays(self):
        """Tuesday 2026-05-26 before Kurban Bayramı must settle on Tuesday 2026-06-02."""
        ex_date = date(2026, 5, 26)
        pay_date = calculate_bist_t_plus_2_settlement(ex_date)
        self.assertEqual(pay_date, date(2026, 6, 2))

    def test_kap_declaration_rejects_weekend_settlement(self):
        """Takasbank does not settle on Saturday."""
        with self.assertRaises(ValueError) as ctx:
            KapDividendDeclaration(
                symbol="FROTO.IS",
                company_name="Ford Otomotiv",
                decision_date=date(2026, 11, 24),
                ex_date=date(2026, 11, 26),
                record_date=date(2026, 11, 27),
                payment_date=date(2026, 11, 28),  # Saturday
                gross_dps=3.07,
                net_dps=2.6095,
            )
        self.assertIn("does not settle dividends on weekends", str(ctx.exception))

    def test_kap_declaration_rejects_holiday_settlement(self):
        """Takasbank does not settle on 29 Ekim Republic Day."""
        with self.assertRaises(ValueError) as ctx:
            KapDividendDeclaration(
                symbol="FROTO.IS",
                company_name="Ford Otomotiv",
                decision_date=date(2026, 10, 20),
                ex_date=date(2026, 10, 27),
                record_date=date(2026, 10, 28),
                payment_date=date(2026, 10, 29),  # 29 Ekim Cumhuriyet Bayramı
                gross_dps=3.07,
                net_dps=2.6095,
            )
        self.assertIn("does not settle dividends on official BIST market holidays", str(ctx.exception))

    def test_kap_declaration_enforces_market_cap_consistency(self):
        """Total payout divided by shares must match gross DPS within ₺0.02."""
        with self.assertRaises(ValueError) as ctx:
            KapDividendDeclaration(
                symbol="FROTO.IS",
                company_name="Ford Otomotiv",
                decision_date=date(2026, 11, 24),
                ex_date=date(2026, 11, 26),
                record_date=date(2026, 11, 27),
                payment_date=date(2026, 11, 30),
                gross_dps=3.07,
                net_dps=2.6095,
                total_gross_amount_try=10_000_000_000.0,
                total_shares_outstanding=5_000_000_000.0,
            )
        self.assertIn("Market cap check failed", str(ctx.exception))

    def test_cash_ledger_overcredit_prevention_calculation(self):
        """Verify that using net DPS vs gross DPS prevents the 18% overcredit."""
        gross_dps = 3.07
        net_dps = 2.6095
        shares = 10_000

        credited_net = shares * net_dps
        credited_gross_mistake = shares * gross_dps

        self.assertEqual(credited_net, 26_095.0)
        self.assertEqual(credited_gross_mistake, 30_700.0)
        overcredit = credited_gross_mistake - credited_net
        self.assertAlmostEqual(overcredit, 4605.0, places=2)

if __name__ == '__main__':
    unittest.main()
