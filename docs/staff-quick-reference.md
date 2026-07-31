# Staff Quick Reference

**Print this page and keep it at the till.**

LAN address (shop Wi‑Fi only): **`https://dreamy-cafe.local`**

> Use the **name**, not a number — it keeps working if the till PC's address ever changes.
> If it will not load, the fallback is **`https://192.168.0.10`**. Note there is no
> `:3000` on the end any more, and it is `https`, not `http`. A tablet that has not been
> set up yet needs [ipad-till-setup.md](ipad-till-setup.md) first.

---

## Start of shift

**Shop PC (till):** open **`open-pos.bat`** for the fullscreen Electron kiosk (when Windows services run the server). Use `start-pos.bat` only if you are **not** using NSSM services.

**Tablets on Wi‑Fi:** open the **Dreamy Cafe** app icon on the home screen (or Safari →
`https://dreamy-cafe.local`).

1. **Clock in** — tap your name, enter PIN.
2. Tell the manager to **open the cash drawer** (Manager → Cash → opening float).
3. Only **one POS window** per tablet — if you see a lock screen, close the other tab.

---

## Taking an order

1. Tap products to add to cart. Pick category tabs at the top.
2. Tap a line to change quantity, modifiers, or notes.
3. **Charge** → pick payment:
   - **Cash** — enter amount tendered; give change shown.
   - **Card** — customer taps the reader; wait for success before walking away.
   - **Split** — multiple people pay separately (by amount or by item).
4. Pick a **table** if dine-in (or skip for takeaway).
5. If **Admin → Printers** has auto-print enabled, dockets and tax receipts print automatically after each in-store sale
   (reprint from order history).

---

## Online orders

- New paid orders **chime** and pop up — pick a prep time.
- **Online** tab: **Mark Ready** when bagged, **Collected** when handed over.
- If the chime stops, check the **Online** tab manually.

---

## Common problems

| Problem | What to do |
|---------|------------|
| **"Internet down" banner** | Shop WAN is down but the POS server is OK. **Cash and cash split** still work; **card and online orders** do not. |
| **"Cannot reach POS server" banner** | Shop PC app or database is down — wait for server or restart; no payments until it clears. |
| **Card reader not working** | Use **cash**. Tell manager. Do not tap "Card" repeatedly. |
| **Printer didn't print** | Order is still saved. Manager can **Reprint Docket** from Sales → History. |
| **Wrong item / customer changed mind** | **Do not** edit the order. Manager **refunds** it; ring a new order. |
| **Item sold out** | Tell manager — they disable it in Manager → Menu. |
| **Second POS won't open** | Close the other POS tab on this tablet, or use **Take over** if intentional. |
| **iPad can't open POS** | Use full URL `http://<shop-pc-ip>:3000/pos` in **Safari** (same shop Wi‑Fi, not guest). iPad **Settings → Privacy & Security → Local Network → Safari → On**. On the shop PC run `scripts\test-lan-pos.ps1`; if LAN fails, run `scripts\allow-lan-pos.ps1` as Administrator. |

---

## End of shift

1. **Clock out** when you leave.
2. Manager **closes the cash drawer** at end of day (not every staff change unless your shop policy says otherwise).

---

## Who to ask

| Need | Ask |
|------|-----|
| Refund, discount override, cash drawer | **Manager** (Manager PIN) |
| New staff account, payments, printers | **Owner** (Admin PIN) |

**Manager panel:** navbar → Manager → PIN → Menu, Cash, Sales, Timesheets.

**Never share your PIN.**
