<?php
// Copy to /home/<cpanel-user>/advantage-leads/quote-config.php (outside public_html)
// to override the defaults in api/quote.php. Every key is optional.
return [
    'to' => 'service@advantagemovingaustin.com',        // where quote emails go (comma-separate for more)
    'from' => 'website@advantagemovingaustin.com',      // sender address on the notification
    'from_name' => 'Advantage Moving website',
    'per_ip_per_hour' => 5,                              // spam brake per visitor
];
