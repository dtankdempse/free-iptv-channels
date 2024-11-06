function doGet(e) {
  const params = e.parameter;
  const region = (params.region || 'us').toLowerCase().trim();
  const service = params.service;
  const sort = params.sort || 'name';

  // Check if the service parameter is missing
  if (!service) {
    return ContentService.createTextOutput('Error: No service type provided').setMimeType(ContentService.MimeType.TEXT);
  }

  // Handle Pluto TV service
  if (service.toLowerCase() === 'plutotv') {
    return handlePlutoDirect(region, sort);
  }

  // Handle Plex service with caching and sorting
  if (service.toLowerCase() === 'plex') {
    return handlePlex(region, sort);
  }

  // Handle Tubi service
  if (service.toLowerCase() === 'tubi') {
    let data;

    try {
      Logger.log('Fetching new Tubi data');
      const playlistUrl = 'https://github.com/dtankdempse/tubi-m3u/raw/refs/heads/main/tubi_playlist_us.m3u';
      const response = UrlFetchApp.fetch(playlistUrl);
      data = response.getContentText();
      
      let output = '';
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

  if (data.channels) {
    // Channels are directly in the data object, and group extraction is needed
    channels = data.channels;
    groupExtractionRequired = true;

  } else if (data.regions) {
    // Channels are inside regions, no special group extraction needed
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
    }  else if (regions[region]) {
      channels = regions[region].channels || {};
    } else {
      return ContentService.createTextOutput(`Error: Invalid region ${region}`).setMimeType(ContentService.MimeType.TEXT);
    }
  } else {
    return ContentService.createTextOutput('Error: Invalid data format').setMimeType(ContentService.MimeType.TEXT);
  }

  const startChno = params.start_chno ? parseInt(params.start_chno) : null;
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

  // Handle group-title for SamsungTVPlus when region is "all"
  if (service.toLowerCase() === 'samsungtvplus' && region === 'all' && channel.region) {
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

    output += `#EXTINF:-1 channel-id="${channelId}" tvg-name="${name}" tvg-id="${key}" tvg-logo="${logo}" group-title="${group}"${chno},${name}\n${url}\n`;
  }
     
  });

  output = output.replace(/tvg-id="(.*?)-\w{2}"/g, 'tvg-id="$1"');

  return ContentService.createTextOutput(output).setMimeType(ContentService.MimeType.TEXT);
}

function formatPbsDataForM3U8(data) {
  let output = '#EXTM3U x-tvg-url="https://github.com/matthuisman/i.mjh.nz/raw/master/PBS/all.xml.gz"\n';

  Object.keys(data.channels).forEach(key => {
    const channel = data.channels[key];
    
    if (channel.name && channel.logo && channel.license && channel.url) {
      output += '#EXTINF:-1 channel-id="pbs-' + key + '" tvg-id="' + key + '" tvg-name="' + channel.name + '" tvg-logo="' + channel.logo + '", ' + channel.name + '\n';
      output += '#KODIPROP:inputstream.adaptive.manifest_type=mpd\n';
      output += '#KODIPROP:inputstream.adaptive.license_type=com.widevine.alpha\n';
      output += '#KODIPROP:inputstream.adaptive.license_key=' + channel.license + '|Content-Type=application%2Foctet-stream&user-agent=okhttp%2F4.9.0|R{SSM}|\n';
      output += channel.url + '|user-agent=okhttp%2F4.9.0\n';
    }
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
      
      output += `#EXTINF:-1 channel-id="pbskids-${key}" tvg-name="${name}" tvg-id="${key}" tvg-logo="${logo}", ${name}\n${url}\n`;
    });

    return output;
  } catch (error) {
    Logger.log('Error fetching PBS Kids data: ' + error.message);
    return ContentService.createTextOutput('Error fetching PBS Kids data: ' + error.message).setMimeType(ContentService.MimeType.TEXT);
  }
}

function handlePlutoDirect(region, sort) {
  const PLUTO_URL = 'https://i.mjh.nz/PlutoTV/.channels.json';
  const STREAM_URL_TEMPLATE = 'https://jmp2.uk/plu-{id}.m3u8';

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

  try {   
    const response = UrlFetchApp.fetch(PLUTO_URL);
    const data = JSON.parse(response.getContentText());

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
      // Handle a single specified region
      if (!data.regions[region]) {
        return ContentService.createTextOutput(`Error: Region '${region}' not found in Pluto data`).setMimeType(ContentService.MimeType.TEXT);
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

    return ContentService.createTextOutput(output).setMimeType(ContentService.MimeType.TEXT);
  } catch (error) {
    Logger.log('Error fetching Pluto TV data: ' + error.message);
    return ContentService.createTextOutput('Error fetching Pluto data: ' + error.message).setMimeType(ContentService.MimeType.TEXT);
  }
}

function handlePlex(region, sort) {
  const PLEX_URL = 'https://i.mjh.nz/Plex/.channels.json';
  const CHANNELS_JSON_URL = 'https://raw.githubusercontent.com/dtankdempse/free-iptv-channels/main/plex/channels.json';
  const STREAM_URL_TEMPLATE = 'https://jmp2.uk/plex-{id}.m3u8';

  sort = sort || 'name';
  let data;
  let plexChannels = [];

  try {
    // Fetch fresh Plex data from URL
    Logger.log('Fetching new Plex data from URL: ' + PLEX_URL);
    const response = UrlFetchApp.fetch(PLEX_URL);
    data = JSON.parse(response.getContentText());

    // Fetch fresh channels.json data from URL
    Logger.log('Fetching new channels.json data from URL: ' + CHANNELS_JSON_URL);
    const channelsResponse = UrlFetchApp.fetch(CHANNELS_JSON_URL);
    plexChannels = JSON.parse(channelsResponse.getContentText());
  } catch (error) {
    return handleError('Error fetching Plex or channels data: ' + error.message);
  }

  let output = `#EXTM3U url-tvg="https://github.com/matthuisman/i.mjh.nz/raw/master/Plex/${region}.xml.gz"\n`;
  const regionNameMap = {
    us: "United States",
    mx: "Mexico",
    es: "Spain",
    ca: "Canada",
    au: "Australia",
    nz: "New Zealand"
  };
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

          // Set group to region full name, bypassing genre from channels.json
          channels[uniqueChannelId] = { ...channel, region: regionFullName, group: regionFullName, originalId: channelKey };
        }
      }
    }
  } else {
    if (!data.regions[region]) {
      return handleError(`Error: Region '${region}' not found in Plex data.`);
    }
    for (const channelKey in data.channels) {
      const channel = data.channels[channelKey];
      if (channel.regions.includes(region)) {
        // For specific region, use genre from channels.json if available
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

    // Use group for the group-title in the M3U output
    output += `#EXTINF:-1 channel-id="${channelId}" tvg-id="${channelId}" tvg-chno="${chno || ''}" tvg-name="${name}" tvg-logo="${logo}" group-title="${group}", ${name}\n`;
    output += STREAM_URL_TEMPLATE.replace('{id}', originalId) + '\n'; // Use original channelKey (without region) in URL
  });

  output = output.replace(/tvg-id="(.*?)-\w{2}"/g, 'tvg-id="$1"'); 

 return ContentService.createTextOutput(output).setMimeType(ContentService.MimeType.TEXT);
}
