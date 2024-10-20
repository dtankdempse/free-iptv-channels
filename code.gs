function doGet(e) {
  const params = e.parameter;
  const region = (params.region || 'us').toLowerCase().trim();
  const service = params.service;

  // Check if the service parameter is missing
  if (!service) {
    return ContentService.createTextOutput('Error: No service type provided').setMimeType(ContentService.MimeType.TEXT);
  }

  // Handle Tubi service without caching
if (service.toLowerCase() === 'tubi') {
  let data;

  try {
    Logger.log('Fetching new Tubi data');
    const playlistUrl = 'https://github.com/dtankdempse/tubi-m3u/raw/refs/heads/main/tubi_playlist_us.m3u';
    const response = UrlFetchApp.fetch(playlistUrl);
    data = response.getContentText();

    let epgUrl = 'https://raw.githubusercontent.com/dtankdempse/tubi-m3u/refs/heads/main/tubi_epg_us.xml';
    let output = `#EXTM3U url-tvg="${epgUrl}"
`;
    output += data;

    return ContentService.createTextOutput(output)
      .setMimeType(ContentService.MimeType.TEXT);
  } catch (error) {
    Logger.log('Error fetching Tubi data: ' + error.message);
    return handleError('Error fetching Tubi data: ' + error.message);
  }
}

  
  if (service.toLowerCase() === 'pbskids') {
	const pbsKidsOutput = handlePBSKids();  // Call the PBS Kids handler function
	return ContentService.createTextOutput(pbsKidsOutput).setMimeType(ContentService.MimeType.TEXT);
  }

  const APP_URL = 'https://i.mjh.nz/' + service + '/.app.json';
  const response = UrlFetchApp.fetch(APP_URL);
  const data = JSON.parse(response.getContentText());

  if (service.toLowerCase() === 'pbs') {
    return ContentService.createTextOutput(formatPbsDataForM3U8(data))
      .setMimeType(ContentService.MimeType.TEXT);
  }

  let channels = {};
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

    // Plex-specific region filtering logic
    if (service.toLowerCase() === 'plex' && region !== 'all') {
      const channelsJsonUrl = 'https://raw.githubusercontent.com/dtankdempse/free-iptv-channels/main/plex/channels.json';
      
      // Fetch the Plex channels JSON
      const plexChannelsResponse = UrlFetchApp.fetch(channelsJsonUrl);
      const plexChannels = JSON.parse(plexChannelsResponse.getContentText());

      channels = Object.keys(channels).reduce((filteredChannels, key) => {
        const channel = channels[key];
        
        if (channel.regions && channel.regions.includes(region)) {
          // Search for the channel in the Plex channels JSON by title
          const plexChannel = plexChannels.find(ch => ch.Title === channel.name);
          
          // Use the genre from the Plex channels JSON for group-title, default to "Uncategorized"
          const genre = plexChannel && plexChannel.Genre ? plexChannel.Genre : 'Uncategorized';

          // Assign only the genre when region is NOT 'all'
          filteredChannels[key] = { 
            ...channel, 
            group: `${genre}` // Ensure it only assigns genre here, not region
          };
        }

        return filteredChannels;
      }, {});
    }

    // Separate logic when region is "all" for region-based mapping
    if (service.toLowerCase() === 'plex' && region === 'all') {
      channels = Object.keys(channels).reduce((filteredChannels, key) => {
        const channel = channels[key];

        // Add the regionNameMap mapping for each region
        if (channel.regions && channel.regions.length > 0) {
          channel.regions.forEach(regionCode => {
            const regionFullName = regionNameMap[regionCode] || regionCode.toUpperCase();

            filteredChannels[key] = {
              ...channel,
              group: `${regionFullName}` // Only apply region name when region is "all"
            };
          });
        }

        return filteredChannels;
      }, {});
    }

    function getPlexToken(countryCode) {
  var headers = {
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

  var params = {
    'X-Plex-Product': 'Plex Web',
    'X-Plex-Version': '4.126.1',
    'X-Plex-Client-Identifier': Utilities.getUuid(),  // Generate a unique identifier
    'X-Plex-Language': 'en',
    'X-Plex-Platform': 'Chrome',
    'X-Plex-Platform-Version': '123.0',
    'X-Plex-Features': 'external-media,indirect-media,hub-style-list',
    'X-Plex-Model': 'hosted',
    'X-Plex-Device': 'Linux',
    'X-Plex-Device-Name': 'Chrome',
    'X-Plex-Device-Screen-Resolution': '1282x929,1920x1080',
  };

  // Update headers with the X-Forwarded-For if necessary
  var xForwardedForMap = {
    'uk': '178.238.11.6',
    'us': '185.236.200.172',
    'ca': '192.206.151.131',
    // Add more country codes if needed
  };

  if (xForwardedForMap.hasOwnProperty(countryCode)) {
    headers['X-Forwarded-For'] = xForwardedForMap[countryCode];
  }

  var url = 'https://clients.plex.tv/api/v2/users/anonymous';

  // Set up the fetch options with parameters and headers
  var options = {
    'method': 'post',
    'headers': headers,
    'muteHttpExceptions': true  // Get response even on error codes
  };

  // Send the request
  var response = UrlFetchApp.fetch(url + "?" + encodeParams(params), options);

   // Check response code
  if (response.getResponseCode() == 200 || response.getResponseCode() == 201) {
    var responseData = JSON.parse(response.getContentText());
    var token = responseData.authToken; // Grab the auth token from response
    Logger.log("Token: " + token);
    return token;
  } else {
    Logger.log("Error fetching token: " + response.getResponseCode());
    return null;
  }
}

// Helper function to encode the parameters for the URL
function encodeParams(params) {
  return Object.keys(params).map(function(key) {
    return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
  }).join('&');
}

    groupExtractionRequired = true;
  } else if (data.regions) {
    // Channels are inside regions, no special group extraction needed
    const regions = data.regions;

    // Populate regionNames for Plex using the provided map
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
    }  else if (regions[region]) {
      channels = regions[region].channels || {};
    } else {
      return ContentService.createTextOutput(`Error: Invalid region ${region}`).setMimeType(ContentService.MimeType.TEXT);
    }
  } else {
    return ContentService.createTextOutput('Error: Invalid data format').setMimeType(ContentService.MimeType.TEXT);
  }

  const startChno = params.start_chno ? parseInt(params.start_chno) : null;
  const sort = params.sort || 'name';
  const include = (params.include || '').split(',').filter(Boolean);
  const exclude = (params.exclude || '').split(',').filter(Boolean);

  let output = `#EXTM3U url-tvg="https://github.com/matthuisman/i.mjh.nz/raw/master/` + service + `/${region}.xml.gz"\n`;
  
  // Add this condition to set EPG to "all" for Roku regardless of region
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
    const { logo, name, url, regions } = channel; // Extract regions from channel
    const channelId = `${service}-${key}`;

    // If group extraction is required (channels are outside regions), use the first group from the groups array
    let group = groupExtractionRequired
      ? (channel.group || '') // Avoid adding the region name here
      : (channel.group || '');
	  
	// Add this condition to remove the group title for Roku
	if (service.toLowerCase() === 'roku') {
	  group = ''; // No group title for Roku
	}

    // Handle group-title for Plex
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

          output += `#EXTINF:-1 channel-id="${channelId}" tvg-id="${key}" tvg-logo="${logo}" group-title="${regionFullName}"${chno},${name}\n${url}\n`;
        }
      });
    } else {
      // Handle group-title for SamsungTVPlus and PlutoTV when region is "all"
      if ((service.toLowerCase() === 'samsungtvplus' || service.toLowerCase() === 'plutotv') && region === 'all' && channel.region) {
        group = channel.region;  // Set group-title to region name only
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

        output += `#EXTINF:-1 channel-id="${channelId}" tvg-id="${key}" tvg-logo="${logo}" group-title="${group}"${chno},${name}\n${url}\n`;
      }
    }
  });

  if (service.toLowerCase() === 'plex') {
	  // Fetch the Plex token
	  const plexToken = getPlexToken(); // You can pass the region if needed
	  
	  if (plexToken) {
		// Perform the string replacements for Plex only if a valid token is returned
		output = output.replace(/https:\/\/jmp2\.uk\/Plex\//g, 'https://epg.provider.plex.tv/library/parts/');
		output = output.replace(/\.m3u8/g, `.m3u8?X-Plex-Token=${plexToken}`);

		// Log the modified output for debugging
		Logger.log('Modified output for Plex: ' + output);
	  } else {		
		Logger.log('Plex token not retrieved. Skipping token replacement.');
	  }
	}

  output = output.replace(/tvg-id="(.*?)-\w{2}"/g, 'tvg-id="$1"');

  return ContentService.createTextOutput(output).setMimeType(ContentService.MimeType.TEXT);
}

function formatPbsDataForM3U8(data) {
  let output = '#EXTM3U x-tvg-url="https://github.com/matthuisman/i.mjh.nz/raw/master/PBS/all.xml.gz"\n';

  Object.keys(data.channels).forEach(key => {
    const channel = data.channels[key];
    output += '#EXTINF:-1 channel-id="pbs-' + key + '" tvg-id="' + key + '" tvg-logo="' + channel.logo + '", ' + channel.name + '\n';
    output += '#KODIPROP:inputstream.adaptive.manifest_type=mpd\n';
    output += '#KODIPROP:inputstream.adaptive.license_type=com.widevine.alpha\n';
    output += '#KODIPROP:inputstream.adaptive.license_key=' + channel.license + '|Content-Type=application%2Foctet-stream&user-agent=okhttp%2F4.9.0|R{SSM}|\n';
    output += channel.url + '|user-agent=okhttp%2F4.9.0\n';
  });

  return output;
}

function handlePBSKids() {
  const APP_URL = 'https://i.mjh.nz/PBS/.kids_app.json';
  const EPG_URL = 'https://github.com/matthuisman/i.mjh.nz/raw/master/PBS/kids_all.xml.gz';
  let response;
  
  try {
    response = UrlFetchApp.fetch(APP_URL);
    const data = JSON.parse(response.getContentText());

    let output = `#EXTM3U url-tvg="${EPG_URL}"\n`;

    // Sort the channels by name before iterating
    const sortedKeys = Object.keys(data.channels).sort((a, b) => {
      const channelA = data.channels[a].name.toLowerCase();
      const channelB = data.channels[b].name.toLowerCase();
      return channelA.localeCompare(channelB);
    });

    sortedKeys.forEach(key => {
      const channel = data.channels[key];
      const { logo, name, url } = channel; // Extract necessary data from the channel
      
      output += `#EXTINF:-1 channel-id="pbskids-${key}" tvg-id="${key}" tvg-logo="${logo}", ${name}\n${url}\n`;
    });

    return output;
  } catch (error) {
    Logger.log('Error fetching PBS Kids data: ' + error.message);
    return ContentService.createTextOutput('Error fetching PBS Kids data: ' + error.message).setMimeType(ContentService.MimeType.TEXT);
  }
}
