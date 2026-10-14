<?php
/*
 * Quote requests from the website form (site.js posts JSON here).
 *
 * Every request is saved first to a private log outside the web root, then emailed
 * to the office. If the email fails, the lead is still saved and the visitor still
 * sees success, so nothing is lost; see the lead log in /home/<user>/advantage-leads/.
 *
 * Optional settings live in quote-config.php beside the leads folder (outside the
 * web root, never published). See api/quote-config.example.php.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function respond(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body);
    exit;
}

$home = dirname($_SERVER['DOCUMENT_ROOT'] ?? __DIR__ . '/..');
$dataDir = $home . '/advantage-leads';
$config = [
    'to' => 'advantagemovingaustin@gmail.com',
    'from' => 'website@advantagemovingaustin.com',
    'from_name' => 'Advantage Moving website',
    'allowed_hosts' => ['advantagemovingaustin.com', 'www.advantagemovingaustin.com'],
    'per_ip_per_hour' => 5,
];
if (is_file($dataDir . '/quote-config.php')) {
    $config = array_merge($config, (array) require $dataDir . '/quote-config.php');
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    respond(405, ['error' => 'Use POST']);
}

// Only accept posts from our own pages.
$origin = $_SERVER['HTTP_ORIGIN'] ?? ($_SERVER['HTTP_REFERER'] ?? '');
$originHost = strtolower((string) parse_url($origin, PHP_URL_HOST));
$selfHost = strtolower((string) preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? ''));
if ($originHost === '' || ($originHost !== $selfHost && !in_array($originHost, $config['allowed_hosts'], true))) {
    respond(403, ['error' => 'Forbidden']);
}

$raw = file_get_contents('php://input', false, null, 0, 20000);
$in = json_decode((string) $raw, true);
if (!is_array($in)) {
    respond(400, ['error' => 'Invalid request']);
}

// Honeypot: bots fill the hidden field; pretend it worked.
if (trim((string) ($in['_gotcha'] ?? '')) !== '') {
    respond(200, ['ok' => true]);
}

function field(array $in, string $key, int $max = 200): string
{
    $v = $in[$key] ?? '';
    if (!is_string($v)) {
        return '';
    }
    $v = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $v) ?? '';
    return function_exists('mb_substr') ? mb_substr(trim($v), 0, $max) : substr(trim($v), 0, $max);
}

$lead = [
    'reference' => field($in, 'reference', 40),
    'name' => field($in, 'name', 120),
    'phone' => field($in, 'phone', 40),
    'email' => field($in, 'email', 160),
    'from' => field($in, 'Moving from'),
    'to' => field($in, 'Moving to'),
    'date' => field($in, 'Move date', 60),
    'type' => field($in, 'Move type', 80),
    'ballpark' => field($in, 'Ballpark seen'),
    'call_back' => field($in, 'Call back', 120),
    'subject' => field($in, '_subject', 160),
    'page' => field($in, 'Source page', 300),
    'timezone' => field($in, 'Visitor timezone', 60),
];

$errors = [];
if ($lead['name'] === '') $errors[] = 'name';
if (strlen(preg_replace('/\D/', '', $lead['phone']) ?? '') < 10) $errors[] = 'phone';
if (!filter_var($lead['email'], FILTER_VALIDATE_EMAIL)) $errors[] = 'email';
if ($lead['from'] === '' || $lead['to'] === '' || $lead['type'] === '') $errors[] = 'move details';
if ($errors) {
    respond(422, ['error' => 'Please check: ' . implode(', ', $errors)]);
}
if (!preg_match('/^ADV-[A-Z0-9-]{4,30}$/', $lead['reference'])) {
    $lead['reference'] = 'ADV-' . strtoupper(bin2hex(random_bytes(4)));
}

if (!is_dir($dataDir) && !mkdir($dataDir, 0700, true) && !is_dir($dataDir)) {
    respond(500, ['error' => 'Storage unavailable']);
}

// Simple per-IP rate limit (hashed; raw IPs are not kept).
$ipHash = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . '|advantage');
$rateFile = $dataDir . '/rate.json';
$now = time();
$fh = fopen($rateFile, 'c+');
if ($fh && flock($fh, LOCK_EX)) {
    $rates = json_decode((string) stream_get_contents($fh), true) ?: [];
    foreach ($rates as $k => $times) {
        $rates[$k] = array_values(array_filter((array) $times, fn($t) => $t > $now - 3600));
        if (!$rates[$k]) unset($rates[$k]);
    }
    if (count($rates[$ipHash] ?? []) >= (int) $config['per_ip_per_hour']) {
        flock($fh, LOCK_UN);
        fclose($fh);
        respond(429, ['error' => 'Too many requests. Please call (512) 443-6141.']);
    }
    $rates[$ipHash][] = $now;
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode($rates));
    flock($fh, LOCK_UN);
    fclose($fh);
}

// Save the lead before anything else can fail.
$lead['received_at'] = gmdate('c');
$lead['emailed'] = false;
$logFile = $dataDir . '/leads-' . gmdate('Y-m') . '.jsonl';

$label = [
    'Reference' => $lead['reference'],
    'Call back' => $lead['call_back'],
    'Name' => $lead['name'],
    'Phone' => $lead['phone'],
    'Email' => $lead['email'],
    'Moving from' => $lead['from'],
    'Moving to' => $lead['to'],
    'Move date' => $lead['date'],
    'Move type' => $lead['type'],
    'Ballpark seen' => $lead['ballpark'],
    'Source page' => $lead['page'],
    'Visitor timezone' => $lead['timezone'],
    'Received (UTC)' => $lead['received_at'],
];
$body = "New quote request from the website.\n\n";
foreach ($label as $k => $v) {
    $body .= str_pad($k . ':', 18) . ($v === '' ? '-' : $v) . "\n";
}
$digits = preg_replace('/\D/', '', $lead['phone']);
$body .= "\nCall: tel:+1" . substr((string) $digits, -10) . "\nReply to this email to answer the customer directly.\n";

$clean = fn(string $s) => trim(preg_replace('/[\r\n]+/', ' ', $s) ?? '');
$subject = $clean($lead['subject'] !== '' ? $lead['subject'] : 'New quote ' . $lead['reference']);
$headers = implode("\r\n", [
    'From: ' . $clean($config['from_name']) . ' <' . $clean($config['from']) . '>',
    'Reply-To: ' . $clean($lead['name']) . ' <' . $clean($lead['email']) . '>',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    'X-Quote-Reference: ' . $lead['reference'],
]);
$encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
$lead['emailed'] = @mail($config['to'], $encodedSubject, $body, $headers, '-f' . $clean($config['from']));

file_put_contents($logFile, json_encode($lead, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n", FILE_APPEND | LOCK_EX);
@chmod($logFile, 0600);

respond(200, ['ok' => true, 'reference' => $lead['reference']]);
