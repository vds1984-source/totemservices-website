<?php
// Opt-in private enquiry outbox. No CRM writes, acknowledgements or queue deletion.
require_once __DIR__ . '/enquiry-validation.php';

class TotemOutboxConflict extends RuntimeException {}
class TotemOutboxInput extends InvalidArgumentException {}

function totem_outbox_uuid($value): string {
    if (!is_string($value) || !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/D', $value)) {
        throw new TotemOutboxInput('A valid submission reference is required.');
    }
    return $value;
}

// Production capture uses only this fixed private JSON file, never environment/request selectors.
function totem_outbox_config_stat_or_missing(string $path): ?array {
    clearstatcache(true, $path);
    $stat = @lstat($path);
    if ($stat !== false) return $stat;
    // A failed stat is not proof of absence (permissions/open_basedir can also fail).
    $directory = @opendir(dirname($path));
    if ($directory === false) throw new RuntimeException('Private enquiry configuration is unavailable.');
    try {
        $count = 0;
        while (($name = readdir($directory)) !== false) {
            if (++$count > 1024 || $name === basename($path)) {
                throw new RuntimeException('Private enquiry configuration is unavailable.');
            }
        }
        clearstatcache(true, $path);
        if (@lstat($path) !== false) throw new RuntimeException('Private enquiry configuration is unavailable.');
        return null;
    } finally {
        closedir($directory);
    }
}

function totem_outbox_config_same_stat(array $before, array $after, bool $directory = false): bool {
    $keys = $directory ? ['dev', 'ino', 'mode', 'uid'] : ['dev', 'ino', 'mode', 'uid', 'nlink', 'size', 'mtime', 'ctime'];
    foreach ($keys as $key) {
        if (!array_key_exists($key, $before) || !array_key_exists($key, $after) || $before[$key] !== $after[$key]) return false;
    }
    return true;
}

function totem_outbox_context_recheck(array $context): void {
    // Recheck each ancestor too: a stable file descriptor alone does not prove its pathname is unchanged.
    clearstatcache(true);
    foreach ($context['ancestors'] as $path => $before) {
        $after = @lstat($path);
        if ($after === false || !totem_outbox_config_same_stat($before, $after, true)
            || realpath($path) !== $path) {
            throw new RuntimeException('Private enquiry configuration is unavailable.');
        }
    }
}

function totem_outbox_context(string $documentRoot): array {
    if (PHP_OS_FAMILY === 'Windows') throw new RuntimeException('Private POSIX storage is required.');
    clearstatcache(true);
    $public = $documentRoot === '' ? false : realpath($documentRoot);
    if ($public === false || !is_dir($public) || $public === dirname($public)) {
        throw new RuntimeException('Private enquiry configuration is unavailable.');
    }
    $domain = dirname($public);
    $private = $domain . '/private';
    $home = $private . '/totem-enquiries';
    $context = ['public' => $public, 'private' => $private, 'home' => $home, 'present' => false, 'ancestors' => []];
    foreach ([$domain, $public] as $path) {
        $stat = @lstat($path);
        if ($stat === false || ($stat['mode'] & 0170000) !== 0040000 || realpath($path) !== $path) {
            throw new RuntimeException('Private enquiry configuration is unavailable.');
        }
        $context['ancestors'][$path] = $stat;
    }
    $privateBefore = totem_outbox_config_stat_or_missing($private);
    if ($privateBefore === null) {
        totem_outbox_context_recheck($context);
        return $context;
    }
    // The established mail/rate-limit parent remains untouched; 0755 is safe for this owned child.
    if (!function_exists('posix_geteuid') || ($privateBefore['mode'] & 0170000) !== 0040000
        || ($privateBefore['mode'] & 0700) !== 0700 || ($privateBefore['mode'] & 0022) !== 0
        || $privateBefore['uid'] !== posix_geteuid() || is_link($private) || realpath($private) !== $private
        || strpos($private . '/', $public . '/') === 0) {
        throw new RuntimeException('Private enquiry configuration is unavailable.');
    }
    $context['ancestors'][$private] = $privateBefore;
    $homeBefore = totem_outbox_config_stat_or_missing($home);
    if ($homeBefore === null) {
        totem_outbox_context_recheck($context);
        return $context;
    }
    if (($homeBefore['mode'] & 0170000) !== 0040000 || ($homeBefore['mode'] & 07777) !== 0700
        || $homeBefore['uid'] !== posix_geteuid() || is_link($home) || realpath($home) !== $home) {
        throw new RuntimeException('Private enquiry configuration is unavailable.');
    }
    $context['ancestors'][$home] = $homeBefore;
    $context['present'] = true;
    totem_outbox_context_recheck($context);
    return $context;
}

function totem_outbox_settings(string $documentRoot): array {
    $context = totem_outbox_context($documentRoot);
    if (!$context['present']) return ['enabled' => false, 'feedToken' => null];
    $path = $context['home'] . '/config.json';
    $before = totem_outbox_config_stat_or_missing($path);
    if ($before === null) {
        totem_outbox_context_recheck($context);
        return ['enabled' => false, 'feedToken' => null];
    }
    totem_outbox_check_path($path, false);
    if (realpath($path) !== $path || ($before['mode'] & 07777) !== 0600
        || $before['uid'] !== posix_geteuid() || $before['size'] < 1 || $before['size'] > 4096) {
        throw new RuntimeException('Private enquiry configuration is unavailable.');
    }
    $handle = @fopen($path, 'rb');
    if ($handle === false) throw new RuntimeException('Private enquiry configuration is unavailable.');
    try {
        $opened = fstat($handle);
        if ($opened === false || !totem_outbox_config_same_stat($before, $opened)) {
            throw new RuntimeException('Private enquiry configuration is unavailable.');
        }
        $deadline = hrtime(true) + 2000000000;
        while (!@flock($handle, LOCK_SH | LOCK_NB)) {
            if (hrtime(true) >= $deadline) throw new RuntimeException('Private enquiry configuration is unavailable.');
            usleep(10000);
        }
        $locked = fstat($handle);
        if ($locked === false || !totem_outbox_config_same_stat($before, $locked)) {
            throw new RuntimeException('Private enquiry configuration is unavailable.');
        }
        $raw = @stream_get_contents($handle, 4097);
        if ($raw === false || strlen($raw) > 4096 || strlen($raw) !== $before['size']) {
            throw new RuntimeException('Private enquiry configuration is unavailable.');
        }
        clearstatcache(true);
        $after = @lstat($path);
        $descriptorAfter = fstat($handle);
        if ($after === false || $descriptorAfter === false
            || !totem_outbox_config_same_stat($before, $after)
            || !totem_outbox_config_same_stat($before, $descriptorAfter)
            || realpath($path) !== $path) {
            throw new RuntimeException('Private enquiry configuration is unavailable.');
        }
        totem_outbox_context_recheck($context);
    } finally {
        @flock($handle, LOCK_UN);
        fclose($handle);
    }
    $config = json_decode($raw, false, 8, JSON_THROW_ON_ERROR);
    if (!($config instanceof stdClass) || array_keys(get_object_vars($config)) !== ['version', 'enabled', 'feedToken']
        || $config->version !== 1 || !is_bool($config->enabled)
        || !((is_string($config->feedToken) && preg_match('/^[A-Za-z0-9_-]{32,128}$/D', $config->feedToken))
            || (!$config->enabled && $config->feedToken === null))
        || json_encode($config, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) !== trim($raw, " \t\r\n")) {
        throw new RuntimeException('Private enquiry configuration is unavailable.');
    }
    return ['enabled' => $config->enabled, 'feedToken' => $config->feedToken];
}

function totem_outbox_prepare_submission(array $post): array {
    if (array_key_exists('SubmissionId', $post)) {
        totem_outbox_uuid($post['SubmissionId']);
        return $post;
    }
    // Legacy/no-JavaScript POSTs have no retry identity; each gets a new reference.
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 15) | 64);
    $bytes[8] = chr((ord($bytes[8]) & 63) | 128);
    $hex = bin2hex($bytes);
    $post['SubmissionId'] = substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4)
        . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20, 12);
    return $post;
}

function totem_outbox_fields(array $post, int $now): array {
    $validated = totem_validate_enquiry($post, $now);
    if ($validated['errors']) throw new TotemOutboxInput('Invalid enquiry fields.');
    $fields = $validated['fields'];
    unset($fields['FormType']);
    return [$fields, $validated['fields']['FormType'], $validated['source_url']];
}

function totem_outbox_check_path(string $path, bool $directory): void {
    clearstatcache(true, $path);
    $stat = @lstat($path);
    $expected = $directory ? 0040000 : 0100000;
    if ($stat === false || is_link($path) || ($stat['mode'] & 0170000) !== $expected
        || ($stat['mode'] & 0777) !== ($directory ? 0700 : 0600)
        || (!$directory && $stat['nlink'] !== 1)
        || (function_exists('posix_geteuid') && $stat['uid'] !== posix_geteuid())) {
        throw new RuntimeException('Private outbox storage is unavailable.');
    }
}

function totem_outbox_directory(string $documentRoot, bool $create): ?string {
    $context = totem_outbox_context($documentRoot);
    if (!$context['present']) {
        if ($create) throw new RuntimeException('Private outbox storage is unavailable.');
        return null;
    }
    $directory = $context['home'] . '/outbox';
    $before = totem_outbox_config_stat_or_missing($directory);
    if ($before === null) {
        totem_outbox_context_recheck($context);
        if (!$create) return null;
        // Provisioning the legacy parent and dedicated home is always an owner action.
        // Only the queue beneath this already validated 0700 home may be created here.
        if (!@mkdir($directory, 0700) && totem_outbox_config_stat_or_missing($directory) === null) {
            throw new RuntimeException('Private outbox storage is unavailable.');
        }
    }
    totem_outbox_check_path($directory, true);
    $queueAfter = @lstat($directory);
    if ($queueAfter === false || realpath($directory) !== $directory || ($queueAfter['mode'] & 07777) !== 0700
        || ($before !== null && !totem_outbox_config_same_stat($before, $queueAfter, true))) {
        throw new RuntimeException('Private outbox storage is unavailable.');
    }
    $context['ancestors'][$directory] = $queueAfter;
    totem_outbox_context_recheck($context);
    return $directory;
}

function totem_outbox_inventory(string $directory): array {
    $files = [];
    $entries = @scandir($directory);
    if ($entries === false) throw new RuntimeException('Private outbox storage is unavailable.');
    foreach ($entries as $name) {
        if ($name === '.' || $name === '..' || $name === 'queue.lock') continue;
        if (strpos($name, '.receipt-') === 0) {
            // A crash can leave an unpublished temporary file. Never serve it.
            totem_outbox_check_path($directory . '/' . $name, false);
            continue;
        }
        if (!preg_match('/^([0-9]{20})_([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.json$/D', $name, $match)
            || $match[1] === str_repeat('0', 20)) throw new RuntimeException('Private outbox state is invalid.');
        totem_outbox_check_path($directory . '/' . $name, false);
        $files[] = $name;
        if (count($files) > 10000) throw new RuntimeException('Private outbox capacity exceeded.');
    }
    sort($files, SORT_STRING);
    return $files;
}

function totem_outbox_locked(string $directory, bool $create, callable $operation) {
    $path = $directory . '/queue.lock';
    clearstatcache(true, $path);
    if (@lstat($path) === false) {
        if (!$create) throw new RuntimeException('Private outbox storage is unavailable.');
        $initial = @fopen($path, 'x+b');
        if ($initial !== false) {
            if (!@chmod($path, 0600)) { fclose($initial); throw new RuntimeException('Private outbox storage is unavailable.'); }
            fclose($initial);
        }
    }
    totem_outbox_check_path($path, false);
    $before = lstat($path);
    $handle = @fopen($path, 'r+b');
    if ($handle === false) throw new RuntimeException('Private outbox storage is unavailable.');
    try {
        $opened = fstat($handle);
        if ($opened['ino'] !== $before['ino'] || $opened['dev'] !== $before['dev'] || !@flock($handle, $create ? LOCK_EX : LOCK_SH)) {
            throw new RuntimeException('Private outbox storage is unavailable.');
        }
        totem_outbox_check_path($path, false);
        return $operation();
    } finally {
        @flock($handle, LOCK_UN);
        fclose($handle);
    }
}

function totem_outbox_read(string $directory, string $name): array {
    totem_outbox_check_path($directory . '/' . $name, false);
    $raw = @file_get_contents($directory . '/' . $name, false, null, 0, 32769);
    if ($raw === false || strlen($raw) > 32768) throw new RuntimeException('Private outbox state is invalid.');
    $wrapper = json_decode($raw, true);
    if (!is_array($wrapper) || array_keys($wrapper) !== ['sequence', 'envelope']) throw new RuntimeException('Private outbox state is invalid.');
    $envelope = $wrapper['envelope'];
    if (!is_int($wrapper['sequence']) || $wrapper['sequence'] < 1 || !is_array($envelope)
        || array_keys($envelope) !== ['version', 'sourceSystem', 'submissionId', 'receivedAt', 'formType', 'sourceUrl', 'fields']
        || $envelope['version'] !== 1 || $envelope['sourceSystem'] !== 'TOTEM_WEBSITE'
        || !is_string($envelope['receivedAt']) || !preg_match('/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/D', $envelope['receivedAt'])
        || !is_array($envelope['fields'])) throw new RuntimeException('Private outbox state is invalid.');
    $id = totem_outbox_uuid($envelope['submissionId']);
    if (sprintf('%020d', $wrapper['sequence']) . '_' . $id . '.json' !== $name) throw new RuntimeException('Private outbox state is invalid.');
    $post = $envelope['fields'];
    $post['FormType'] = $envelope['formType'];
    [$fields, $formType, $source] = totem_outbox_fields($post, 0);
    if ($envelope['fields'] !== $fields || $envelope['formType'] !== $formType || $envelope['sourceUrl'] !== $source
        || gmdate('Y-m-d\TH:i:s\Z', strtotime($envelope['receivedAt'])) !== $envelope['receivedAt']) {
        throw new RuntimeException('Private outbox state is invalid.');
    }
    return $wrapper;
}

function totem_outbox_enqueue(array $post, int $now, string $documentRoot): array {
    $id = totem_outbox_uuid($post['SubmissionId'] ?? null);
    [$fields, $formType, $source] = totem_outbox_fields($post, $now);
    if ($now < 0) throw new TotemOutboxInput('Invalid receipt time.');
    $directory = totem_outbox_directory($documentRoot, true);
    return totem_outbox_locked($directory, true, function () use ($directory, $id, $fields, $formType, $source, $now) {
        $files = totem_outbox_inventory($directory);
        $maximum = 0;
        $existing = null;
        foreach ($files as $name) {
            $sequenceText = substr($name, 0, 20);
            if (strlen(ltrim($sequenceText, '0')) > 9) throw new RuntimeException('Private outbox state is invalid.');
            $sequence = (int)$sequenceText;
            if ($sequence <= $maximum) throw new RuntimeException('Private outbox state is invalid.');
            $maximum = $sequence;
            if (substr($name, 21, 36) === $id) {
                if ($existing !== null) throw new RuntimeException('Private outbox state is invalid.');
                $existing = totem_outbox_read($directory, $name)['envelope'];
            }
        }
        if ($existing !== null) {
            if ($existing['fields'] !== $fields || $existing['formType'] !== $formType || $existing['sourceUrl'] !== $source) {
                throw new TotemOutboxConflict('This submission reference already belongs to a different enquiry.');
            }
            return $existing;
        }
        if (count($files) >= 10000 || $maximum >= 999999999) throw new RuntimeException('Private outbox capacity exceeded.');
        $sequence = $maximum + 1;
        $envelope = ['version' => 1, 'sourceSystem' => 'TOTEM_WEBSITE', 'submissionId' => $id,
            'receivedAt' => gmdate('Y-m-d\TH:i:s\Z', $now), 'formType' => $formType, 'sourceUrl' => $source, 'fields' => $fields];
        $encoded = json_encode(['sequence' => $sequence, 'envelope' => $envelope], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . "\n";
        $temporary = @tempnam($directory, '.receipt-');
        if ($temporary === false || realpath(dirname($temporary)) !== $directory) throw new RuntimeException('Private outbox storage is unavailable.');
        try {
            if (!@chmod($temporary, 0600) || @file_put_contents($temporary, $encoded) !== strlen($encoded)) throw new RuntimeException('Private outbox storage is unavailable.');
            totem_outbox_check_path($temporary, false);
            $target = $directory . '/' . sprintf('%020d', $sequence) . '_' . $id . '.json';
            if (@lstat($target) !== false || !@rename($temporary, $target)) throw new RuntimeException('Private outbox storage is unavailable.');
            $temporary = null;
        } finally {
            if (is_string($temporary)) @unlink($temporary);
        }
        return $envelope;
    });
}

function totem_outbox_feed(string $documentRoot, int $limit, ?string $cursor): array {
    if ($limit < 1 || $limit > 20 || ($cursor !== null && !preg_match('/^[0-9]{20}_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/D', $cursor))) {
        throw new TotemOutboxInput('Invalid feed pagination.');
    }
    $directory = totem_outbox_directory($documentRoot, false);
    // A genuinely absent queue is empty; reading it must not create directories.
    if ($directory === null) {
        if ($cursor !== null) throw new TotemOutboxInput('Invalid feed cursor.');
        return ['version' => 1, 'sourceSystem' => 'TOTEM_WEBSITE', 'items' => [], 'nextCursor' => null];
    }
    if (@lstat($directory . '/queue.lock') === false && totem_outbox_inventory($directory) === []) {
        if ($cursor !== null) throw new TotemOutboxInput('Invalid feed cursor.');
        return ['version' => 1, 'sourceSystem' => 'TOTEM_WEBSITE', 'items' => [], 'nextCursor' => null];
    }
    return totem_outbox_locked($directory, false, function () use ($directory, $limit, $cursor) {
        $files = totem_outbox_inventory($directory);
        if ($cursor !== null && !in_array($cursor . '.json', $files, true)) throw new TotemOutboxInput('Invalid feed cursor.');
        $items = [];
        $nextCursor = null;
        foreach ($files as $name) {
            $key = substr($name, 0, -5);
            if ($cursor !== null && strcmp($key, $cursor) <= 0) continue;
            $items[] = totem_outbox_read($directory, $name)['envelope'];
            $nextCursor = $key;
            if (count($items) === $limit) break;
        }
        return ['version' => 1, 'sourceSystem' => 'TOTEM_WEBSITE', 'items' => $items, 'nextCursor' => $nextCursor];
    });
}

