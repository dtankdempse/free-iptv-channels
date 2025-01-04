function doGet(e) {
  const params = e.parameter;
  const region = (params.region || 'us').toLowerCase().trim();
  const service = params.service;
  const sort = params.sort || 'name';

  if (!service) {
    return handleError('Error: No service type provided');
  }

  // Handle Pluto TV service
  if (service.toLowerCase() === 'plutotv') {
    return handlePluto(region, sort);
  }

  // Handle Plex service
  if (service.toLowerCase() === 'plex') {
    return handlePlex(region, sort);
  }

  // Handle SamsungTVPlus service
  if (service.toLowerCase() === 'samsungtvplus') {
    return handleSamsungTVPlus(region, sort);
  }

  // Handle Roku service
  if (service.toLowerCase() === 'roku') {
    return handleRoku(sort);
  }

  // Handle Stirr service
  if (service.toLowerCase() === 'stirr') {
    return handleStirr(sort);
  }

  // Handle Tubi service
  if (service.toLowerCase() === 'tubi') {
    return handleTubi(service);
  }

  // Handle PBSKids service
  if (service.toLowerCase() === 'pbskids') {
     return handlePBSKids(service);
  }

  // Handle PBS service
  if (service.toLowerCase() === 'pbs') {
     return handlePBS();
  }

  // If no matching service was found, return an error
  return handleError('Error: Unsupported service type provided');

}

//------ Service Functions ------//

function handlePluto(region, sort) {
  const PLUTO_URL = 'https://i.mjh.nz/PlutoTV/.channels.json.gz';
  const STREAM_URL_TEMPLATE = 'https://jmp2.uk/plu-{id}.m3u8';
  
  sort = sort || 'name';

  let data;

  try {
    Logger.log('Fetching new Pluto data from URL: ' + PLUTO_URL);

    // Fetch the gzipped file
    const response = UrlFetchApp.fetch(PLUTO_URL);
    let gzipBlob = response.getBlob();

    // Set content type to application/x-gzip (Gzip Bug Workaround)
    gzipBlob = gzipBlob.setContentType('application/x-gzip');

    // Decompress the gzipped data
    const extractedBlob = Utilities.ungzip(gzipBlob);
    const extractedData = extractedBlob.getDataAsString();

    // Parse JSON data
    data = JSON.parse(extractedData);

    Logger.log('Data successfully extracted and parsed.');
  } catch (error) {
    Logger.log('Error fetching or processing Pluto data: ' + error.message);
    return handleError('Error fetching Pluto data: ' + error.message);
  }

  let output = `#EXTM3U url-tvg="https://github.com/matthuisman/i.mjh.nz/raw/master/PlutoTV/${region}.xml.gz"\n`;
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
      return handleError(`Error: Region '${region}' not found in Pluto data.`);
    }
    channels = data.regions[region].channels || {};
  }

  const sortedChannelIds = Object.keys(channels).sort((a, b) => {
    const channelA = channels[a];
    const channelB = channels[b];
    if (sort === 'chno') {
      return channelA.chno - channelB.chno;
    } else {
      return channelA.name.localeCompare(channelB.name);
    }
  });

  sortedChannelIds.forEach(channelId => {
    const channel = channels[channelId];
    const { chno, name, description, group, logo, region: channelRegion } = channel;

    const groupTitle = region === 'all' ? `${channelRegion}` : group;

    output += `#EXTINF:-1 channel-id="${channelId}" tvg-id="${channelId}" tvg-chno="${chno}" tvg-name="${name}" tvg-logo="${logo}" group-title="${groupTitle}", ${name}\n`;
    output += STREAM_URL_TEMPLATE.replace('{id}', channelId.split('-')[0]) + '\n';
  });

  output = output.replace(/tvg-id="(.*?)-\w{2}"/g, 'tvg-id="$1"');

  return ContentService.createTextOutput(output).setMimeType(ContentService.MimeType.TEXT);
}

function handlePlex(region, sort) {
  const PLEX_URL = 'https://i.mjh.nz/Plex/.channels.json.gz';
  const CHANNELS_JSON_URL = 'https://raw.githubusercontent.com/dtankdempse/free-iptv-channels/main/plex/channels.json';
  const STREAM_URL_TEMPLATE = 'https://jmp2.uk/plex-{id}.m3u8';

  sort = sort || 'name';
  let data;
  let plexChannels = [];

  try {
    Logger.log('Fetching new Plex data from URL: ' + PLEX_URL);

    // Fetch the gzipped file
    const response = UrlFetchApp.fetch(PLEX_URL);
    let gzipBlob = response.getBlob();

    // Set content type to application/x-gzip (Gzip Bug Workaround)
    gzipBlob = gzipBlob.setContentType('application/x-gzip');

    // Decompress the gzipped data
    const extractedBlob = Utilities.ungzip(gzipBlob);
    const extractedData = extractedBlob.getDataAsString();

    // Parse JSON data
    data = JSON.parse(extractedData);

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

  // Return output directly to the browser
  return ContentService.createTextOutput(output).setMimeType(ContentService.MimeType.TEXT);
}

function handleSamsungTVPlus(region, sort) {
  const SAMSUNG_URL = 'https://i.mjh.nz/SamsungTVPlus/.channels.json.gz';
  const STREAM_URL_TEMPLATE = 'https://jmp2.uk/sam-{id}.m3u8';

  // Set a default for `sort` if not provided
  sort = sort || 'name';

  let data;

  try {
    Logger.log('Fetching new SamsungTVPlus data from URL: ' + SAMSUNG_URL);

    // Fetch the gzipped file
    const response = UrlFetchApp.fetch(SAMSUNG_URL);
    
    let gzipBlob = response.getBlob();

    // Set content type to application/x-gzip (Gzip Bug Workaround)
    gzipBlob = gzipBlob.setContentType('application/x-gzip');

    // Decompress the gzipped data
    const extractedBlob = Utilities.ungzip(gzipBlob);
    const extractedData = extractedBlob.getDataAsString();

    // Parse JSON data
    data = JSON.parse(extractedData);

  } catch (error) {
    Logger.log('Error fetching or processing SamsungTVPlus data: ' + error.message);
    return handleError('Error fetching SamsungTVPlus data: ' + error.message);
  }

  let output = `#EXTM3U url-tvg="https://github.com/matthuisman/i.mjh.nz/raw/master/SamsungTVPlus/${region}.xml.gz"\n`;
  let channels = {};

  // If "all" is specified, gather channels from each region
  if (region === 'all') {
    for (const regionKey in data.regions) {
      const regionData = data.regions[regionKey];
      const regionFullName = regionData.name || regionKey.toUpperCase();
      for (const channelKey in regionData.channels) {
        const channel = { ...regionData.channels[channelKey], region: regionFullName };
        const uniqueChannelId = `${channelKey}-${regionKey}`;
        channels[uniqueChannelId] = channel;
      }
    }
  } else {
    // Handle a single specified region
    if (!data.regions[region]) {
      return handleError(`Error: Region '${region}' not found in SamsungTVPlus data.`);
    }
    channels = data.regions[region].channels || {};
  }

  // Sort channels based on the specified sorting criteria
  const sortedChannelIds = Object.keys(channels).sort((a, b) => {
    const channelA = channels[a];
    const channelB = channels[b];
    if (sort === 'chno') {
      return channelA.chno - channelB.chno;
    } else {
      return channelA.name.localeCompare(channelB.name);
    }
  });

  sortedChannelIds.forEach(channelId => {
    const channel = channels[channelId];
    const { chno, name, description, group, logo, region: channelRegion } = channel;

    // Include region name in group title when "all" is specified
    const groupTitle = region === 'all' ? `${channelRegion}` : group;

    output += `#EXTINF:-1 channel-id="${channelId}" tvg-id="${channelId}" tvg-chno="${chno}" tvg-name="${name}" tvg-logo="${logo}" group-title="${groupTitle}", ${name}\n`;
    output += STREAM_URL_TEMPLATE.replace('{id}', channelId.split('-')[0]) + '\n';
  });

  output = output.replace(/tvg-id="(.*?)-\w{2}"/g, 'tvg-id="$1"');

  // Return output directly to the browser
  return ContentService.createTextOutput(output).setMimeType(ContentService.MimeType.TEXT);
}

function handleRoku(sort) {
  const ROKU_URL = 'https://i.mjh.nz/Roku/.channels.json.gz';
  const STREAM_URL_TEMPLATE = 'https://jmp2.uk/rok-{id}.m3u8';

  // Set a default for `sort` if not provided
  sort = sort || 'name';

  let data;

  try {
    Logger.log('Fetching new Roku data from URL: ' + ROKU_URL);

    // Fetch the gzipped file
    const response = UrlFetchApp.fetch(ROKU_URL);

    let gzipBlob = response.getBlob();

    // Set content type to application/x-gzip (Gzip Bug Workaround)
    gzipBlob = gzipBlob.setContentType('application/x-gzip');

    // Decompress the gzipped data
    const extractedBlob = Utilities.ungzip(gzipBlob);
    const extractedData = extractedBlob.getDataAsString();

    // Parse JSON data
    data = JSON.parse(extractedData);

  } catch (error) {
    Logger.log('Error fetching or processing Roku data: ' + error.message);
    return handleError('Error fetching Roku data: ' + error.message);
  }

  let output = `#EXTM3U url-tvg="https://github.com/matthuisman/i.mjh.nz/raw/master/Roku/all.xml.gz"\n`;
  let channels = data.channels || {};

  // Sort channels based on the specified sorting criteria
  const sortedChannelIds = Object.keys(channels).sort((a, b) => {
    const channelA = channels[a];
    const channelB = channels[b];
    if (sort === 'chno') {
      return channelA.chno - channelB.chno;
    } else {
      return channelA.name.localeCompare(channelB.name);
    }
  });

  sortedChannelIds.forEach(channelId => {
    const channel = channels[channelId];
    const { chno, name, description, groups, logo } = channel;

    // Use the first group in `groups` array for `group-title`
    const groupTitle = groups && groups.length > 0 ? groups[0] : 'Uncategorized';

    output += `#EXTINF:-1 channel-id="${channelId}" tvg-id="${channelId}" tvg-chno="${chno}" tvg-name="${name}" tvg-logo="${logo}" group-title="", ${name}\n`;
    output += STREAM_URL_TEMPLATE.replace('{id}', channelId) + '\n';
  });

  // Return output directly to the browser
  return ContentService.createTextOutput(output).setMimeType(ContentService.MimeType.TEXT);
}

function handleStirr(sort) {
  const STIRR_URL = 'https://i.mjh.nz/Stirr/.channels.json.gz';

  // Set a default for `sort` if not provided
  sort = sort || 'name';

  let data;

  try {
    Logger.log('Fetching new Stirr data from URL: ' + STIRR_URL);

    // Fetch the gzipped file
    const response = UrlFetchApp.fetch(STIRR_URL);

    let gzipBlob = response.getBlob();

    // Set content type to application/x-gzip (Gzip Bug Workaround)
    gzipBlob = gzipBlob.setContentType('application/x-gzip');

    // Decompress the gzipped data
    const extractedBlob = Utilities.ungzip(gzipBlob);
    const extractedData = extractedBlob.getDataAsString();

    // Parse JSON data
    data = JSON.parse(extractedData);

  } catch (error) {
    Logger.log('Error fetching or processing Stirr data: ' + error.message);
    return handleError('Error fetching Stirr data: ' + error.message);
  }

  let output = `#EXTM3U url-tvg="https://i.mjh.nz/Stirr/all.xml.gz"\n`;
  let channels = data.channels || {};

  // Sort channels based on the specified sorting criteria
  const sortedChannelIds = Object.keys(channels).sort((a, b) => {
    const channelA = channels[a];
    const channelB = channels[b];
    if (sort === 'chno') {
      return channelA.chno - channelB.chno;
    } else {
      return channelA.name.localeCompare(channelB.name);
    }
  });

  sortedChannelIds.forEach(channelId => {
    const channel = channels[channelId];
    const { chno, name, groups, logo } = channel;

    // Concatenate all groups, separated by commas
    const groupTitle = groups && groups.length > 0 ? groups.join(', ') : 'Uncategorized';

    // Generate the stream URL using the template
    const streamUrl = `https://jmp2.uk/str-${channelId}.m3u8`;

    output += `#EXTINF:-1 channel-id="${channelId}" tvg-id="${channelId}" tvg-chno="${chno}" tvg-name="${name}" tvg-logo="${logo}" group-title="${groupTitle}", ${name}\n`;
    output += `${streamUrl}\n`;
  });

  // Return output directly to the browser
  return ContentService.createTextOutput(output).setMimeType(ContentService.MimeType.TEXT);
}

function handleTubi(service) {
  let data;

  try {
    Logger.log('Fetching new Tubi data');
    const playlistUrl = 'https://github.com/dtankdempse/tubi-m3u/raw/refs/heads/main/tubi_playlist_us.m3u';
    const response = UrlFetchApp.fetch(playlistUrl);
    data = response.getContentText();

    let epgUrl = 'https://raw.githubusercontent.com/dtankdempse/tubi-m3u/refs/heads/main/tubi_epg_us.xml';
    let output = `#EXTM3U url-tvg="${epgUrl}"\n`;
    output += data;

    // Return output directly to the browser
    return ContentService.createTextOutput(output).setMimeType(ContentService.MimeType.TEXT);
  } catch (error) {
    Logger.log('Error fetching Tubi data: ' + error.message);
    return handleError('Error fetching Tubi data: ' + error.message);
  }
}

function handlePBSKids(service) {
  if (service.toLowerCase() !== 'pbskids') return;

  let data;

  try {
    Logger.log('Fetching new PBS Kids data');
    const APP_URL = 'https://i.mjh.nz/PBS/.kids_app.json.gz';

    // Fetch the gzipped file
    const response = UrlFetchApp.fetch(APP_URL);
    
    let gzipBlob = response.getBlob();

    // Set content type to application/x-gzip (Gzip Bug Workaround)
    gzipBlob = gzipBlob.setContentType('application/x-gzip');

    // Decompress the gzipped data
    const extractedBlob = Utilities.ungzip(gzipBlob);
    const extractedData = extractedBlob.getDataAsString();

    // Parse JSON data
    data = JSON.parse(extractedData);

    let output = `#EXTM3U url-tvg="https://github.com/matthuisman/i.mjh.nz/raw/master/PBS/kids_all.xml.gz"\n`;

    // Sort the channels by name before iterating
    const sortedKeys = Object.keys(data.channels).sort((a, b) => {
      const channelA = data.channels[a].name.toLowerCase();
      const channelB = data.channels[b].name.toLowerCase();
      return channelA.localeCompare(channelB); // Sort alphabetically by name
    });

    sortedKeys.forEach(key => {
      const channel = data.channels[key];
      const { logo, name, url } = channel;

      output += `#EXTINF:-1 channel-id="pbskids-${key}" tvg-id="${key}" tvg-name="${name}" tvg-logo="${logo}", ${name}\n${url}\n`;
    });

    // Return output directly to the browser
    return ContentService.createTextOutput(output).setMimeType(ContentService.MimeType.TEXT);

  } catch (error) {
    Logger.log('Error fetching PBS Kids data: ' + error.message);
    return handleError('Error fetching PBS Kids data: ' + error.message);
  }
}

function handlePBS() {
  const DATA_URL = 'https://i.mjh.nz/PBS/.app.json.gz';
  const EPG_URL = 'https://i.mjh.nz/PBS/all.xml.gz';

  let data;

  try {
    Logger.log('Fetching new PBS data from URL: ' + DATA_URL);

    // Fetch the gzipped file
    const response = UrlFetchApp.fetch(DATA_URL);

    let gzipBlob = response.getBlob();

    // Set content type to application/x-gzip (Gzip Bug Workaround)
    gzipBlob = gzipBlob.setContentType('application/x-gzip');

    // Decompress the gzipped data
    const extractedBlob = Utilities.ungzip(gzipBlob);
    const extractedData = extractedBlob.getDataAsString();

    // Parse JSON data
    data = JSON.parse(extractedData);

  } catch (error) {
    Logger.log('Error fetching or processing PBS data: ' + error.message);
    return handleError('Error fetching PBS data: ' + error.message);
  }

  // Format data for M3U8
  let output = `#EXTM3U x-tvg-url="${EPG_URL}"\n`;

  Object.keys(data.channels).forEach(key => {
    const channel = data.channels[key];
    output += `#EXTINF:-1 channel-id="pbs-${key}" tvg-id="${key}" tvg-name="${channel.name}" tvg-logo="${channel.logo}", ${channel.name}\n`;
    output += `#KODIPROP:inputstream.adaptive.manifest_type=mpd\n`;
    output += `#KODIPROP:inputstream.adaptive.license_type=com.widevine.alpha\n`;
    output += `#KODIPROP:inputstream.adaptive.license_key=${channel.license}|Content-Type=application%2Foctet-stream&user-agent=okhttp%2F4.9.0|R{SSM}|\n`;
    output += `${channel.url}|user-agent=okhttp%2F4.9.0\n`;
  });

  // Return output directly to the browser
  return ContentService.createTextOutput(output).setMimeType(ContentService.MimeType.TEXT);
}

//------  Other Functions ------//

function handleError(errorMessage) {
  return ContentService.createTextOutput(errorMessage)
    .setMimeType(ContentService.MimeType.TEXT);
}
