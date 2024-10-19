<?php

$encodeString = "aHR0cHM6Ly9mZXRjaC5kYXRhLXNlYXJjaC53b3JrZXJzLmRldi8/dXJsPWh0dHAlM0ElMkYlMkZ3d3cucGxleC50diUyRndwLWpzb24lMkZwbGV4JTJGdjElMkZtZWRpYXZlcnNlJTJGbGl2ZXR2JTJGY2hhbm5lbHMlMkZsaXN0JnJlZmVyZXI9aHR0cHMlM0ElMkYlMkZ3d3cucGxleC50diUyRmxpdmUtdHYtY2hhbm5lbHMlMkY=";
$url = base64_decode($encodeString);

$response = file_get_contents($url);

$data = json_decode($response, true);

$result = [];

if (isset($data['data']['list']) && is_array($data['data']['list'])) {
    foreach ($data['data']['list'] as $channel) {
        
        if (isset($channel['media_title'], $channel['media_categories'], $channel['media_lang'], $channel['media_summary'], $channel['media_link'])) {
            
            $genre = reset($channel['media_categories']);
            
            $result[] = [
                'Title'   => $channel['media_title'],
                'Genre'   => $genre,
                'Language' => $channel['media_lang'],
                'Summary' => $channel['media_summary'],
                'Link'    => $channel['media_link']
            ];
        }
    }
}

$jsonOutput = json_encode($result, JSON_PRETTY_PRINT);
$filePath = 'channels.json';
if (file_put_contents($filePath, $jsonOutput)) {
    echo "File successfully saved to $filePath";
} else {
    echo "Failed to save file.";
}
?>
