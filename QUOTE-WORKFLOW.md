# Advantage Moving quote workflow

## What happens when a visitor submits

1. The website validates the move and contact details in the browser.
2. The request is sent over HTTPS to the configured Formspree form.
3. Formspree stores the lead in its Inbox and emails the connected company inbox.
4. The notification subject includes an `ADV-` reference number.
5. A staff member replies to the notification; the customer's email is already
   set as Reply-To.

## Daily company workflow

1. Open each new quote notification as soon as possible during business hours.
2. Reply by email or call the submitted phone number.
3. Keep the `ADV-` reference in the subject when replying.
4. In the Formspree Inbox, mark or archive the lead after it has been answered.
5. Check the Spam and Over Limit folders at least once each business day.

## Required one-time activation

1. Create the Formspree form under the company-controlled account.
2. Connect and verify `service@advantagemovingaustin.com` (or the final sales
   inbox chosen by Advantage Moving).
3. Paste the form endpoint into `site-config.js`.
4. Restrict accepted submissions to the production site domain.
5. Submit a real end-to-end test and reply to that test message.

## Capacity and recovery

- The free Formspree plan processes up to 50 submissions per month and retains
  submissions for 30 days. Upgrade or export leads before those limits become a
  business risk.
- If delivery fails, the visitor is shown the company's phone number and email
  address instead of a false success message.
- Never put an email password, private API key, or GitHub token in this static
  website.
