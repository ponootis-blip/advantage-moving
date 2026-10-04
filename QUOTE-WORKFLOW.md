# Advantage Moving quote workflow

## What happens when a visitor submits

1. The website validates the move and contact details in the browser.
2. The request is sent over HTTPS to the configured Formspree form.
3. Formspree stores the lead in its Inbox and emails the connected company inbox.
4. The notification subject includes an `ADV-` reference number.
5. A staff member replies to the notification; the customer's email is already
   set as Reply-To.

## Daily company workflow

1. During 8am–5pm, watch the connected inbox and Formspree Inbox for subjects
   beginning with `New Advantage Moving quote — ADV-`.
2. Treat every new lead as **New** until a staff member claims it. Reply-all to
   the internal team with `CLAIMED` if more than one person monitors the inbox.
3. Call first when a phone number is present, then send the short email template
   below so the customer has a written next step.
4. Keep the `ADV-` reference in every subject and note one status in the email:
   `CONTACTED`, `ESTIMATE SENT`, `BOOKED`, or `CLOSED`.
5. Archive the Formspree submission only after it has reached `BOOKED` or
   `CLOSED`. Do not archive unanswered leads.
6. At opening and before closing, check Formspree's Inbox, Spam, and Over Limit
   folders. The dashboard is the backup record if an email alert is missed.

## First-response template

Subject: `Re: [keep the existing ADV- reference]`

> Hi [first name] — thanks for reaching out to Advantage Moving. We received
> your request for a [move type] move from [origin] to [destination] around
> [date]. I’m reviewing the details now. Is there a good time today to call and
> confirm access, inventory, and timing?
>
> Advantage Moving · (512) 443-6141 · service@advantagemovingaustin.com

## Required one-time activation

1. Create the Formspree form under the company-controlled account.
2. Connect and verify `service@advantagemovingaustin.com` (or the final sales
   inbox chosen by Advantage Moving).
3. Paste the form endpoint into `site-config.js`.
4. Restrict accepted submissions to the production site domain.
5. Submit a real end-to-end test and reply to that test message.

## Capacity and recovery

- The free Formspree plan processes up to 50 submissions per month and retains
  submissions for 30 days as of October 2026. Upgrade or export leads before
  those limits become a business risk.
- Over-limit requests are retained but their notification emails and plugins do
  not run until the requests are reprocessed. Check that folder every day.
- If delivery fails, the visitor is shown the company's phone number and email
  address instead of a false success message.
- Never put an email password, private API key, or GitHub token in this static
  website.
- Follow `RECOVERY.md` for an outage, missed notifications, or endpoint rotation.
