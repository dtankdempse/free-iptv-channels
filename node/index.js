const http = require('http');
const https = require('https');
const url = require('url');

const hostname = '0.0.0.0';
const port = 4242;

const regionNameMap = {
  ar: "Argentina",
  br: "Brazil",
  ca: "Canada",
  cl: "Chile",
  de: "Germany",
  dk: "Denmark",
  es: "Spain",
  fr: "France",
  gb: "United Kingdom",
  it: "Italy",
  mx: "Mexico",
  no: "Norway",
  se: "Sweden",
  us: "United States"
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const params = parsedUrl.query;
  const pathname = parsedUrl.pathname;
  const region = (params.region || 'us').toLowerCase().trim();
  const service = params.service;
  const sort = params.sort || 'name';
  
    // Check for the root path "/"
  if (pathname === '/' && !parsedUrl.query.service) {
    return handleHomePage(res);
  }

  // Check if the service parameter is missing
  if (!service) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    return res.end('Error: No service type provided');
  }
  
  // Handle Pluto TV service
  if (service.toLowerCase() === 'plutotv') {
    const plutoOutput = await handlePlutoDirect(region, sort);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end(plutoOutput);
  }
  
  // Handle Plex service
  if (service.toLowerCase() === 'plex') {
    const plexOutput = await handlePlex(region, sort);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end(plexOutput);
  }
  
  if (service.toLowerCase() === 'tubi') {
    const tubiOutput = await handleTubi();
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end(tubiOutput);
  }

  if (service.toLowerCase() === 'pbskids') {
    const pbsKidsOutput = await handlePBSKids();
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end(pbsKidsOutput);
  }

  const APP_URL = `https://i.mjh.nz/${service}/.app.json`;
  let data;
  try {
    data = await fetchJson(APP_URL);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    return res.end('Error: Failed to fetch data');
  }

  if (service.toLowerCase() === 'pbs') {
    const pbsOutput = formatPbsDataForM3U8(data);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end(pbsOutput);
  }

  let channels = {};
  let groupExtractionRequired = false;

  if (data.channels) {
    channels = data.channels;
    groupExtractionRequired = true;
	
  } else if (data.regions) {
	  
    const regions = data.regions;

	if (region === 'all') {
	  for (let regionKey in regions) {
		for (let channelKey in regions[regionKey].channels) {
		  const regionChannel = { ...regions[regionKey].channels[channelKey], region: regions[regionKey].name || regionKey.toUpperCase() };

		  // Generate a unique channelId for each region to avoid overwriting
		  const uniqueChannelId = `${channelKey}-${regionKey}`;
		  
		  channels[uniqueChannelId] = regionChannel;
		}
	  }
	} else if (regions[region]) {
      channels = regions[region].channels || {};
    } else {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      return res.end(`Error: Invalid region ${region}`);
    }
  } else {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    return res.end('Error: Invalid data format');
  }

  const startChno = params.start_chno ? parseInt(params.start_chno) : null;
  const include = (params.include || '').split(',').filter(Boolean);
  const exclude = (params.exclude || '').split(',').filter(Boolean);

  let output = `#EXTM3U url-tvg="https://github.com/matthuisman/i.mjh.nz/raw/master/${service}/${region}.xml.gz"\n`;

  if (service.toLowerCase() === 'roku') {
    output = `#EXTM3U url-tvg="https://github.com/matthuisman/i.mjh.nz/raw/master/roku/all.xml.gz"\n`;
  }

  const sortedKeys = Object.keys(channels).sort((a, b) => {
    const chA = channels[a];
    const chB = channels[b];
     return sort === 'chno' ? (chA.chno - chB.chno) : chA.name.localeCompare(chB.name);
  });

  sortedKeys.forEach(key => {
    const channel = channels[key];
    const { logo, name, url, regions } = channel; 
    const channelId = `${service}-${key}`;

    let group = groupExtractionRequired ? (channel.group || '') : (channel.group || '');

    if (service.toLowerCase() === 'roku') {
      group = '';
    }

    if (service.toLowerCase() === 'plex' && region === 'all' && regions && regions.length > 0) {
      regions.forEach(regionCode => {
        const regionFullName = regionNameMap[regionCode] || regionCode.toUpperCase();

        if (!channel.license_url && (!include.length || include.includes(channelId)) && !exclude.includes(channelId)) {
          let chno = '';
          if (startChno !== null) {
            chno = ` tvg-chno="${startChno}"`;
            startChno++;
          } else if (channel.chno) {
            chno = ` tvg-chno="${channel.chno}"`;
          }

          output += `#EXTINF:-1 channel-id="${channelId}" tvg-name="${name}" tvg-id="${key}" tvg-logo="${logo}" group-title="${regionFullName}"${chno},${name}\n${url}\n`;
        }
      });
    } else {
      if (service.toLowerCase() === 'samsungtvplus' && region === 'all' && channel.region) {
        group = channel.region;
      } else if (region === 'all' && channel.region) {
        const regionCode = channel.region ? channel.region.toUpperCase() : '';
        if (regionCode) {
          group += ` (${regionCode})`;
        }
      }

      if (!channel.license_url && (!include.length || include.includes(channelId)) && !exclude.includes(channelId)) {
        let chno = '';
        if (startChno !== null) {
          chno = ` tvg-chno="${startChno}"`;
          startChno++;
        } else if (channel.chno) {
          chno = ` tvg-chno="${channel.chno}"`;
        }

        output += `#EXTINF:-1 channel-id="${channelId}" tvg-name="${name}" tvg-id="${key}" tvg-logo="${logo}" group-title="${group}"${chno},${name}\n${url}\n`;
      }
    }
  });  
  
  output = output.replace(/tvg-id="(.*?)-\w{2}"/g, 'tvg-id="$1"');

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(output);
});

// Function to handle the home page request
function handleHomePage(res) {
  // Serve the HTML content for the home page
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Multi-Service M3U8 Playlist</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          background-color: #f4f4f9;
          color: #333;
          margin: 0;
          padding: 20px;
        }
        h1 {
          color: #2c3e50;
        }
        p, ul {
          line-height: 1.6;
        }
        pre {
          background-color: #eaeaea;
          padding: 10px;
          border-radius: 5px;
          overflow: auto;
        }
        code {
          color: #c0392b;
        }
        .container {
          max-width: 800px;
          margin: 0 auto;
        }
        .highlight {
          font-weight: bold;
          color: #e74c3c;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Multi-Service M3U8 Playlist</h1>
        <h2>Script Access URL</h2>
        <p>
          Use the following URL to access the hosted script. Replace the 
          <span class="highlight">ADD_REGION</span> and 
          <span class="highlight">ADD_SERVICE</span> placeholders with your desired values:
        </p>
        <pre><code id="access-url"></code></pre>
        <p>
          After customizing the URL by replacing the <span class="highlight">ADD_REGION</span> and <span class="highlight">ADD_SERVICE</span> placeholders (e.g., \`us\` for the US region and \`PlutoTV\` for the service), copy the complete URL and paste it into the "Add Playlist" or "M3U8 URL" section of your IPTV application. Once added, the app will load both the channels and the guide information.
        </p>
  
        <h2>Available Service Parameter Values</h2>
        <ul>
          <li>Plex</li>
          <li>Roku</li>
          <li>SamsungTVPlus</li>
          <li>PlutoTV</li>
          <li>PBS</li>
          <li>PBSKids</li>
          <li>Stirr</li>
		  <li>Tubi</li>
        </ul>

        <h2>Available Region Parameter Values</h2>
        <ul>
          <li><code>all</code> (for all regions)</li>
          <li><code>ar</code> (Argentina)</li>
          <li><code>br</code> (Brazil)</li>
          <li><code>ca</code> (Canada)</li>
          <li><code>cl</code> (Chile)</li>
          <li><code>de</code> (Germany)</li>
          <li><code>dk</code> (Denmark)</li>
          <li><code>es</code> (Spain)</li>
          <li><code>fr</code> (France)</li>
          <li><code>gb</code> (United Kingdom)</li>
          <li><code>mx</code> (Mexico)</li>
          <li><code>no</code> (Norway)</li>
          <li><code>se</code> (Sweden)</li>
          <li><code>us</code> (United States)</li>
        </ul>

        <h2>Available Sorting Parameter Values (optional)</h2>
        <ul>
          <li><code>name</code> (default): Sorts the channels alphabetically by their name.</li>
          <li><code>chno</code>: Sorts the channels by their assigned channel number.</li>
        </ul>
      
	  
		<h2>EPG for TV Guide Information</h2>

		<p>The EPG URLs are embedded directly within the playlists. If you'd prefer to manually add the EPG guide, you can find the relevant URLs for each service on this <a href="https://github.com/matthuisman/i.mjh.nz/">page</a>.</p>

		<h2>Disclaimer:</h2>

		<p>This repository has no control over the streams, links, or the legality of the content provided by Pluto, Samsung, Stirr, Tubi, Plex, PBS, and Roku. Additionally, this script simply converts the JSON files provided by <a href="https://i.mjh.nz">i.mjh.nz</a> into an M3U8 playlist. It is the end user's responsibility to ensure the legal use of these streams. We strongly recommend verifying that the content complies with the laws and regulations of your country before use.</p>
		
		<footer style="text-align: center; margin: 30px 0;">
			<p>Created by <a href="https://github.com/dtankdempse/free-iptv-channels" target="_blank">Tank Dempse</a></p>
		</footer>
	</div>
      <script>
        const origin = window.location.origin;
        const accessUrl = \`\${origin}?region=ADD_REGION&service=ADD_SERVICE\`;

        document.getElementById('access-url').textContent = accessUrl;
      </script>
    </body>
    </html>`);
}

// Function to handle the Pluto TV service
async function handlePlutoDirect(region, sort) {
  const PLUTO_URL = 'https://i.mjh.nz/PlutoTV/.channels.json';
  const STREAM_URL_TEMPLATE = 'https://jmp2.uk/plu-{id}.m3u8';

  try {  
    const data = await fetchJson(PLUTO_URL);
    let output = `#EXTM3U url-tvg="https://github.com/matthuisman/i.mjh.nz/raw/master/PlutoTV/${region}.xml.gz"\n`;
    let channels = {};
   
    if (region === 'all') {
      for (const regionKey in data.regions) {
        const regionData = data.regions[regionKey];
        const regionFullName = regionNameMap[regionKey] || regionKey.toUpperCase();
        for (const channelKey in regionData.channels) {
          const channel = { ...regionData.channels[channelKey], region: regionFullName };
          const uniqueChannelId = `${channelKey}-${regionKey}`;
          channels[uniqueChannelId] = channel;
        }
      }
    } else {      
      if (!data.regions[region]) {
        return `Error: Region '${region}' not found in Pluto data`;
      }
      channels = data.regions[region].channels || {};
    }
   
    const sortedChannelIds = Object.keys(channels).sort((a, b) => {
      const channelA = channels[a];
      const channelB = channels[b];
      return sort === 'chno' ? (channelA.chno - channelB.chno) : channelA.name.localeCompare(channelB.name);
    });
   
    sortedChannelIds.forEach(channelId => {
      const channel = channels[channelId];
      const { chno, name, group, logo, region: channelRegion } = channel;
      const groupTitle = region === 'all' ? `${channelRegion}` : group;

      output += `#EXTINF:-1 channel-id="${channelId}" tvg-id="${channelId}" tvg-chno="${chno}" tvg-name="${name}" tvg-logo="${logo}" group-title="${groupTitle}", ${name}\n`;
      output += STREAM_URL_TEMPLATE.replace('{id}', channelId.split('-')[0]) + '\n';
    });
	
	output = output.replace(/tvg-id="(.*?)-\w{2}"/g, 'tvg-id="$1"');
    return output;
  } catch (error) {
    console.error('Error fetching Pluto TV data:', error.message);
    return 'Error fetching Pluto data: ' + error.message;
  }
}

// Function to handle the Plex service
async function handlePlex(region, sort) {
  const PLEX_URL = 'https://i.mjh.nz/Plex/.channels.json';
  const CHANNELS_JSON_URL = 'https://raw.githubusercontent.com/dtankdempse/free-iptv-channels/main/plex/channels.json';
  const STREAM_URL_TEMPLATE = 'https://jmp2.uk/plex-{id}.m3u8';
  
  sort = sort || 'name';
  let output = `#EXTM3U url-tvg="https://github.com/matthuisman/i.mjh.nz/raw/master/Plex/${region}.xml.gz"\n`;
  const regionNameMap = {
    us: "United States",
    mx: "Mexico",
    es: "Spain",
    ca: "Canada",
    au: "Australia",
    nz: "New Zealand"
  };

  try {
    // Fetch the Plex data
    console.log('Fetching new Plex data from URL:', PLEX_URL);
    const data = await fetchJson(PLEX_URL);

    console.log('Fetching new channels.json data from URL:', CHANNELS_JSON_URL);
    const plexChannels = await fetchJson(CHANNELS_JSON_URL);

    let channels = {};

    // Process channels based on region
    if (region === 'all') {
      for (const regionKey in data.regions) {
        const regionData = data.regions[regionKey];
        const regionFullName = regionNameMap[regionKey] || regionKey.toUpperCase();

        for (const channelKey in data.channels) {
          const channel = data.channels[channelKey];
          if (channel.regions.includes(regionKey)) {
            const uniqueChannelId = `${channelKey}-${regionKey}`;
            channels[uniqueChannelId] = { ...channel, region: regionFullName, group: regionFullName, originalId: channelKey };
          }
        }
      }
    } else {
      if (!data.regions[region]) {
        throw new Error(`Error: Region '${region}' not found in Plex data.`);
      }
      for (const channelKey in data.channels) {
        const channel = data.channels[channelKey];
        if (channel.regions.includes(region)) {
          const matchingChannel = plexChannels.find(ch => ch.Title === channel.name);
          const genre = matchingChannel && matchingChannel.Genre ? matchingChannel.Genre : 'Uncategorized';
          channels[channelKey] = { ...channel, group: genre, originalId: channelKey };
        }
      }
    }

    // Sort channels based on the specified sorting criteria
    const sortedChannelIds = Object.keys(channels).sort((a, b) => {
      const channelA = channels[a];
      const channelB = channels[b];
      return sort === 'chno' ? (channelA.chno - channelB.chno) : channelA.name.localeCompare(channelB.name);
    });

    sortedChannelIds.forEach(channelId => {
      const channel = channels[channelId];
      const { chno, name, logo, group, originalId } = channel;

      output += `#EXTINF:-1 channel-id="${channelId}" tvg-id="${channelId}" tvg-chno="${chno || ''}" tvg-name="${name}" tvg-logo="${logo}" group-title="${group}", ${name}\n`;
      output += STREAM_URL_TEMPLATE.replace('{id}', originalId) + '\n';
    });

    output = output.replace(/tvg-id="(.*?)-\w{2}"/g, 'tvg-id="$1"');
    return output;

  } catch (error) {
    console.error('Error fetching Plex or channels data:', error.message);
    return `Error: ${error.message}`;
  }
}

// Fetch JSON data from the provided URL
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

// Handle Tubi service 
async function handleTubi() {
  const playlistUrl = 'https://github.com/dtankdempse/tubi-m3u/raw/refs/heads/main/tubi_playlist_us.m3u';
  const epgUrl = 'https://raw.githubusercontent.com/dtankdempse/tubi-m3u/refs/heads/main/tubi_epg_us.xml';

  return new Promise((resolve, reject) => {
    try {
      https.get(playlistUrl, (res) => {
        let data = '';

        if (res.statusCode === 302 && res.headers.location) {
          https.get(res.headers.location, (redirectRes) => {
            let redirectData = '';

            redirectRes.on('data', (chunk) => {
              redirectData += chunk;
            });

            redirectRes.on('end', () => {
              try {
                if (redirectData.trim() === '') {
                  reject('Playlist data is empty.');
                  return;
                }
                let output = '';
                output += redirectData;
                resolve(output);
              } catch (error) {
                reject(`Error processing Tubi data: ${error.message}`);
              }
            });
          }).on('error', (error) => {
            reject(`Error fetching redirected Tubi data: ${error.message}`);
          });
          return;
        }

        if (res.statusCode !== 200) {
          reject(`Failed to fetch playlist. Status code: ${res.statusCode}`);
          return;
        }

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (data.trim() === '') {
              reject('Playlist data is empty.');
              return;
            }
            let output = `#EXTM3U url-tvg="${epgUrl}"
`;
            output += data;
            resolve(output);
          } catch (error) {
            reject(`Error processing Tubi data: ${error.message}`);
          }
        });
      }).on('error', (error) => {
        reject(`Error fetching Tubi data: ${error.message}`);
      });
    } catch (error) {
      reject(`Unexpected error: ${error.message}`);
    }
  });
}

// Handle PBS Kids
async function handlePBSKids() {
  const APP_URL = 'https://i.mjh.nz/PBS/.kids_app.json';
  const EPG_URL = 'https://github.com/matthuisman/i.mjh.nz/raw/master/PBS/kids_all.xml.gz';
  
  try {
    const data = await fetchJson(APP_URL);
    let output = `#EXTM3U url-tvg="${EPG_URL}"\n`;

    const sortedKeys = Object.keys(data.channels).sort((a, b) => {
      return data.channels[a].name.toLowerCase().localeCompare(data.channels[b].name.toLowerCase());
    });

    sortedKeys.forEach(key => {
      const channel = data.channels[key];
      output += `#EXTINF:-1 channel-id="pbskids-${key}" tvg-name="${channel.name}" tvg-id="${key}" tvg-logo="${channel.logo}", ${channel.name}\n${channel.url}\n`;
    });

    return output;
  } catch (error) {
    return 'Error fetching PBS Kids data: ' + error.message;
  }
}

// Format PBS data for M3U8
function formatPbsDataForM3U8(data) {
  let output = '#EXTM3U x-tvg-url="https://github.com/matthuisman/i.mjh.nz/raw/master/PBS/all.xml.gz"\n';

  Object.keys(data.channels).forEach(key => {
    const channel = data.channels[key];
    
    if (channel.name && channel.logo && channel.license && channel.url) {
      output += `#EXTINF:-1 channel-id="pbs-${key}" tvg-name="${channel.name}" tvg-id="${key}" tvg-logo="${channel.logo}", ${channel.name}\n`;
      output += `#KODIPROP:inputstream.adaptive.manifest_type=mpd\n`;
      output += `#KODIPROP:inputstream.adaptive.license_type=com.widevine.alpha\n`;
      output += `#KODIPROP:inputstream.adaptive.license_key=${channel.license}|Content-Type=application%2Foctet-stream&user-agent=okhttp%2F4.9.0|R{SSM}|\n`;
      output += `${channel.url}|user-agent=okhttp%2F4.9.0\n`;
    }
  });

  return output;
}


server.listen(port, hostname, () => {
  console.log('Server running at http://localhost:4242/');
});
