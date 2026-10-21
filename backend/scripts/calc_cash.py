import json

orders = [
  {'date': '2026-09-16', 'sym': 'ISMEN', 'side': 'BUY', 'amount': 4981.68},
  {'date': '2026-09-17', 'sym': 'ISMEN', 'side': 'SELL', 'amount': 5358.06},
  {'date': '2026-09-17', 'sym': 'TURSG', 'side': 'BUY', 'amount': 1000.33},
  {'date': '2026-09-18', 'sym': 'TURSG', 'side': 'BUY', 'amount': 5363.52},
  {'date': '2026-09-24', 'sym': 'AKBNK', 'side': 'BUY', 'amount': 2492.00},
  {'date': '2026-09-24', 'sym': 'ISMEN', 'side': 'BUY', 'amount': 2477.60},
  {'date': '2026-09-24', 'sym': 'TURSG', 'side': 'BUY', 'amount': 23.60},
  {'date': '2026-09-28', 'sym': 'TURSG', 'side': 'BUY', 'amount': 1004.40},
  {'date': '2026-09-28', 'sym': 'ISMEN', 'side': 'BUY', 'amount': 2051.28},
  {'date': '2026-09-29', 'sym': 'HALKB', 'side': 'BUY', 'amount': 954.24},
  {'date': '2026-09-29', 'sym': 'SOKM', 'side': 'BUY', 'amount': 454.00},
  {'date': '2026-09-30', 'sym': 'ISMEN', 'side': 'BUY', 'amount': 240.80},
  {'date': '2026-09-30', 'sym': 'TURSG', 'side': 'BUY', 'amount': 540.00},
  {'date': '2026-09-30', 'sym': 'ISMEN', 'side': 'BUY', 'amount': 745.00},
  {'date': '2026-10-01', 'sym': 'KCHOL', 'side': 'BUY', 'amount': 848.00},
  {'date': '2026-10-02', 'sym': 'KRDMD', 'side': 'BUY', 'amount': 962.72},
  {'date': '2026-10-05', 'sym': 'KRDMD', 'side': 'SELL', 'amount': 995.28},
  {'date': '2026-10-06', 'sym': 'YKBN', 'side': 'BUY', 'amount': 941.20},
  {'date': '2026-10-06', 'sym': 'ALARK', 'side': 'BUY', 'amount': 1058.00},
  {'date': '2026-10-06', 'sym': 'VAKBN', 'side': 'BUY', 'amount': 977.30},
  {'date': '2026-10-07', 'sym': 'ENJSA', 'side': 'BUY', 'amount': 1112.00},
  {'date': '2026-10-07', 'sym': 'EREGL', 'side': 'BUY', 'amount': 1019.20},
  {'date': '2026-10-08', 'sym': 'ENJSA', 'side': 'SELL', 'amount': 1135.00},
  {'date': '2026-10-08', 'sym': 'ISMEN', 'side': 'BUY', 'amount': 586.00},
  {'date': '2026-10-08', 'sym': 'ISMEN', 'side': 'BUY', 'amount': 584.00},
  {'date': '2026-10-13', 'sym': 'ALARK', 'side': 'SELL', 'amount': 551.00},
  {'date': '2026-10-13', 'sym': 'ALARK', 'side': 'SELL', 'amount': 551.00},
  {'date': '2026-10-13', 'sym': 'AEFES', 'side': 'BUY', 'amount': 976.79},
  {'date': '2026-10-13', 'sym': 'PETKM', 'side': 'BUY', 'amount': 967.68},
  {'date': '2026-10-13', 'sym': 'KRDMD', 'side': 'BUY', 'amount': 957.44},
  {'date': '2026-10-13', 'sym': 'SOKM', 'side': 'SELL', 'amount': 466.40},
  {'date': '2026-10-14', 'sym': 'CCOLA', 'side': 'BUY', 'amount': 1051.05},
  {'date': '2026-10-14', 'sym': 'BRSAN', 'side': 'BUY', 'amount': 1334.00},
  {'date': '2026-10-15', 'sym': 'AGHOL', 'side': 'BUY', 'amount': 996.96},
  {'date': '2026-10-15', 'sym': 'BIM', 'side': 'BUY', 'amount': 1207.50},
  {'date': '2026-10-15', 'sym': 'TCELL', 'side': 'BUY', 'amount': 1081.30},
  {'date': '2026-10-16', 'sym': 'BIMAS', 'side': 'BUY', 'amount': 1146.75},
  {'date': '2026-10-16', 'sym': 'TURSG', 'side': 'BUY', 'amount': 1040.00},
  {'date': '2026-10-16', 'sym': 'ISMEN', 'side': 'BUY', 'amount': 1238.40},
  {'date': '2026-10-16', 'sym': 'CCOLA', 'side': 'BUY', 'amount': 1532.00},
  {'date': '2026-10-19', 'sym': 'TURSG', 'side': 'BUY', 'amount': 979.68},
  {'date': '2026-10-20', 'sym': 'EREGL', 'side': 'SELL', 'amount': 1040.48},
  {'date': '2026-10-20', 'sym': 'BRSAN', 'side': 'SELL', 'amount': 1371.00},
  {'date': '2026-10-21', 'sym': 'BRSAN', 'side': 'BUY', 'amount': 1320.00}
]

cash = 17000.0
total_deposits = 17000.0
for o in orders:
    if o['side'] == 'SELL':
        cash += o['amount']
        print(f"{o['date']} SELL {o['sym']}: +{o['amount']:.2f} -> Cash: {cash:.2f}")
    elif o['side'] == 'BUY':
        if o['amount'] > cash:
            injected = o['amount'] - cash
            total_deposits += injected
            cash = 0.0
            print(f"{o['date']} BUY  {o['sym']}: -{o['amount']:.2f} (Injected {injected:.2f}) -> Cash: {cash:.2f}")
        else:
            cash -= o['amount']
            print(f"{o['date']} BUY  {o['sym']}: -{o['amount']:.2f} -> Cash: {cash:.2f}")

print("-" * 50)
print(f"FINAL CASH: {cash:.2f} TL")
print(f"TOTAL DEPOSITS (FUNDED): {total_deposits:.2f} TL")
