<?php

function generateUuidV4() {
    // Generate a random UUID v4
    $data = bin2hex(random_bytes(16));
    return sprintf('%s-%s-%s-%s-%s',
        substr($data, 0, 8),
        substr($data, 8, 4),
        substr($data, 12, 4),
        substr($data, 16, 4),
        substr($data, 20)
    );
}

function generateShortHexSid($length) {
    // Generate a random hexadecimal string of the specified length
    $chars = 'abcdef0123456789';
    $sid = '';
    for ($i = 0; $i < $length; $i++) {
        $sid .= $chars[rand(0, strlen($chars) - 1)];
    }
    return $sid;
}

function grabEPG() {
    echo '[INFO] Grabbing EPG...' . PHP_EOL;

    // Start and stop times
    $startTime = urlencode(date('Y-m-d H:00:00.000O'));
    $stopTime = urlencode(date('Y-m-d H:00:00.000O', strtotime('+48 hours')));

    $url = "http://api.pluto.tv/v2/channels?start={$startTime}&stop={$stopTime}";
    echo $url . PHP_EOL;

    $response = file_get_contents($url);
    $channels = json_decode($response, true);

    processEPG($channels);
}

function processEPG($channels) {
    // Sort channels alphabetically by the key 'name'
    usort($channels, function ($a, $b) {
        return strcmp($a['name'], $b['name']);
    });
	
    // Hardcoded URL for the EPG file
    $epgUrl = "https://raw.githubusercontent.com/dtankdempse/public-files/main/pluto/us.xml";

    // Add the url-tvg attribute to the M3U8 playlist
    $m3u8 = "#EXTM3U url-tvg=\"{$epgUrl}\"\n";
    $tvElements = [];
    $processedPrograms = [];
	
	// Generate new deviceId and sid
    $deviceId = generateUuidV4();
    $sid = generateShortHexSid(12);

    foreach ($channels as $channel) {
        if ($channel['isStitched']) {
            $m3uBaseUrl = explode('?', $channel['stitched']['urls'][0]['url'])[0];

            $queryParams = [
                'advertisingId' => '',
                'appName' => 'web',
                'appVersion' => '5.2.2-d60060c7283e0978cc63ba036956b5c1657f8eba',
                'architecture' => '',
                'buildVersion' => '',
                'clientTime' => '',
                'deviceDNT' => '0',
                'deviceId' => $deviceId,
                'deviceLat' => '33.6647',
                'deviceLon' => '-117.1743',
                'deviceMake' => 'Chrome',
                'deviceModel' => 'Chrome',
                'deviceType' => 'web',
                'deviceVersion' => '80.0.3987.149',
                'includeExtendedEvents' => 'false',
                'marketingRegion' => 'US',
                'sid' => $sid,
                'userId' => ''
            ];

            $queryString = http_build_query($queryParams);
            $m3uUrl = "{$m3uBaseUrl}?{$queryString}";

            $m3u8 .= "#EXTINF:0 tvg-id=\"{$channel['slug']}\" tvg-logo=\"{$channel['colorLogoPNG']['path']}\" group-title=\"{$channel['category']}\", {$channel['name']}\n{$m3uUrl}\n\n";

            echo '[INFO] Adding ' . $channel['name'] . ' channel.' . PHP_EOL;

            $channelElement = [
                'name' => 'channel',
                'attrs' => ['id' => $channel['slug']],
                'children' => [
                    ['name' => 'display-name', 'text' => $channel['name']],
                    ['name' => 'icon', 'attrs' => ['src' => $channel['colorLogoPNG']['path']]]
                ]
            ];
            $tvElements[] = $channelElement;
        } else {
            echo "[DEBUG] Skipping 'fake' channel " . $channel['name'] . '.' . PHP_EOL;
        }

        if (isset($channel['timelines'])) {
            foreach ($channel['timelines'] as $programme) {
                $uniqueKey = $channel['slug'] . $programme['start'] . $programme['stop'];

                if (isset($processedPrograms[$uniqueKey])) {
                    continue;
                }

                echo '[INFO] Adding instance of ' . $programme['title'] . ' to channel ' . $channel['name'] . '.' . PHP_EOL;

                $programmeElement = createProgrammeElement($channel, $programme);
                if ($programmeElement) {
                    $tvElements[] = $programmeElement;
                }

                $processedPrograms[$uniqueKey] = true;
            }
        }
    }

    saveFile('Pluto-TV/us.m3u8', $m3u8);

    if (!empty($tvElements)) {
        $tv = new SimpleXMLElement('<tv/>');
        foreach ($tvElements as $element) {
            createElementFromJson($tv, $element);
        }
        saveFile('Pluto-TV/us.xml', $tv->asXML());
        echo '[SUCCESS] Wrote the EPG to us.xml!' . PHP_EOL;
    } else {
        echo '[ERROR] No valid data to generate EPG.' . PHP_EOL;
    }
}

function createProgrammeElement($channel, $programme) {
    try {
        return [
            'name' => 'programme',
            'attrs' => [
                'start' => formatTime($programme['start']),
                'stop' => formatTime($programme['stop']),
                'channel' => $channel['slug']
            ],
            'children' => [
                ['name' => 'title', 'attrs' => ['lang' => 'en'], 'text' => $programme['title']],
                ['name' => 'desc', 'attrs' => ['lang' => 'en'], 'text' => $programme['episode']['description']],
                ['name' => 'category', 'attrs' => ['lang' => 'en'], 'text' => $channel['category']],
                ['name' => 'icon', 'attrs' => ['src' => $programme['episode']['poster']['path']]]
            ]
        ];
    } catch (Exception $e) {
        echo '[ERROR] Failed to create programme element: ' . $e->getMessage() . PHP_EOL;
        return null;
    }
}

function createElementFromJson($parent, $json) {
    if (empty($json['name'])) {
        echo 'Error: Missing name in JSON object.' . PHP_EOL;
        return;
    }

    $element = $parent->addChild($json['name']);

    if (isset($json['attrs'])) {
        foreach ($json['attrs'] as $key => $value) {
            $element->addAttribute($key, $value);
        }
    }

    if (isset($json['text'])) {
        $element[0] = $json['text'];
    }

    if (isset($json['children'])) {
        foreach ($json['children'] as $child) {
            createElementFromJson($element, $child);
        }
    }
}

function formatTime($timestamp) {
    return date('YmdHis O', strtotime($timestamp));
}

function saveFile($filename, $content) {
    $filePath = __DIR__ . '/../pluto/' . basename($filename);
    file_put_contents($filePath, $content);
    echo "[SUCCESS] Saved file: {$filePath}" . PHP_EOL;
}

// Run the function to grab the EPG
grabEPG();

?>
