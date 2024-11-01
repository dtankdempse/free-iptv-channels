const http = require('http');
const https = require('https');
const url = require('url');

const hostname = '0.0.0.0';
const port = 4242;

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const params = parsedUrl.query;
  const pathname = parsedUrl.pathname;
  const region = (params.region || 'us').toLowerCase().trim();
  const service = params.service;
  
    // Check for the root path "/"
  if (pathname === '/' && !parsedUrl.query.service) {
    return handleHomePage(res);
  }

  // Check if the service parameter is missing
  if (!service) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    return res.end('Error: No service type provided');
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
  const sort = params.sort || 'name';
  let groupExtractionRequired = false;
  let regionNames = {}; // For Plex, to map region codes to full names

  // Map of region codes to full names for Plex
  const regionNameMap = {
    us: "USA",
    mx: "Mexico",
    es: "Spain",
    ca: "Canada",
    au: "Australia",
    nz: "New Zealand"
  };

  if (data.channels) {
    // Channels are directly in the data object, and group extraction is needed
    channels = data.channels;
 
	// Plex-specific genre mapping when region is NOT 'all'
	if (service.toLowerCase() === 'plex' && region !== 'all') {
	  const channelsJsonUrl = 'https://raw.githubusercontent.com/dtankdempse/free-iptv-channels/main/plex/channels.json';
	  let plexChannels;
	  try {
		plexChannels = await fetchJson(channelsJsonUrl);
	  } catch (error) {
		res.writeHead(500, { 'Content-Type': 'text/plain' });
		return res.end('Error: Failed to fetch Plex channels');
	  }

	  channels = Object.keys(channels).reduce((filteredChannels, key) => {
		const channel = channels[key];
		if (channel.regions && channel.regions.includes(region)) {
		  // Search for the channel in the Plex channels JSON by title
		  const plexChannel = plexChannels.find(ch => ch.Title === channel.name);

		  // Use the genre from the Plex channels JSON for group-title, default to "Uncategorized"
		  const genre = plexChannel && plexChannel.Genre ? plexChannel.Genre : 'Uncategorized';
		  
		  // Assign the genre to the group-title
		  filteredChannels[key] = { 
			...channel, 
			group: `${genre}`
		  };
		}
		return filteredChannels;
	  }, {});
	}

	function getPlexToken(countryCode = null) {
	  return new Promise((resolve, reject) => {
		const headers = {
		  'Accept': 'application/json, text/javascript, */*; q=0.01',
		  'Accept-Language': 'en',
		  'Origin': 'https://app.plex.tv',
		  'Referer': 'https://app.plex.tv/',
		  'Sec-Ch-Ua-Mobile': '?0',
		  'Sec-Ch-Ua-Platform': '"Linux"',
		  'Sec-Fetch-Dest': 'empty',
		  'Sec-Fetch-Mode': 'cors',
		  'Sec-Fetch-Site': 'same-site',
		  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
		};

		const params = {
		  'X-Plex-Product': 'Plex Web',
		  'X-Plex-Version': '4.126.1',
		  'X-Plex-Client-Identifier': uuidv4(),  // Generate a unique identifier
		  'X-Plex-Language': 'en',
		  'X-Plex-Platform': 'Chrome',
		  'X-Plex-Platform-Version': '123.0',
		  'X-Plex-Features': 'external-media,indirect-media,hub-style-list',
		  'X-Plex-Model': 'hosted',
		  'X-Plex-Device': 'Linux',
		  'X-Plex-Device-Name': 'Chrome',
		  'X-Plex-Device-Screen-Resolution': '1282x929,1920x1080',
		};

		const plexUrl = `https://clients.plex.tv/api/v2/users/anonymous?${encodeParams(params)}`;

		const options = {
		  method: 'POST',
		  headers: headers,
		};

		const req = https.request(plexUrl, options, (res) => {
		  let data = '';

		  res.on('data', (chunk) => {
			data += chunk;
		  });

		  res.on('end', () => {
			if (res.statusCode === 200 || res.statusCode === 201) {
			  const responseData = JSON.parse(data);
			  const token = responseData.authToken;
			  resolve(token);
			} else {
			  reject(new Error(`Failed to fetch token. Status code: ${res.statusCode}`));
			}
		  });
		});

		req.on('error', (e) => {
		  reject(e);
		});

		req.end();
	  });
	}

	function encodeParams(params) {
	  return Object.keys(params).map((key) => {
		return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
	  }).join('&');
	}

	// Custom UUIDv4 generator
	function uuidv4() {
	  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
		var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
		return v.toString(16);
	  });
	}

    groupExtractionRequired = true;
  } else if (data.regions) {
    // Channels are inside regions, no special group extraction needed
    const regions = data.regions;

    if (service.toLowerCase() === 'plex') {
      for (let regionKey in regions) {
        regionNames[regionKey] = regionNameMap[regionKey] || regionKey.toUpperCase();
      }
    }

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
      if ((service.toLowerCase() === 'samsungtvplus' || service.toLowerCase() === 'plutotv') && region === 'all' && channel.region) {
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
  
	if (service.toLowerCase() === 'plex') {	 
	  try {
		const plexToken = await getPlexToken();

		if (plexToken) {		
		  output = output.replace(/https:\/\/jmp2\.uk\/Plex\//g, 'https://epg.provider.plex.tv/library/parts/');
		  output = output.replace(/\.m3u8/g, `.m3u8?X-Plex-Token=${plexToken}`);
		  
		  //console.log('Modified output for Plex: ', output);
		} else {		
		  console.log('Plex token not retrieved. Skipping token replacement.');
		}
	  } catch (err) {
		console.error('Failed to get Plex token:', err.message);		
	  }
	}

  
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
