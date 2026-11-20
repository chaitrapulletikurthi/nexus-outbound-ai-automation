const buyers = $('Buyer Record Search').all();
const deals = $('Deals Search').all();

const results = [];

// Convert Airtable linked-record fields into arrays
function toArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  return [];
}

// Convert dates into timestamps for sorting
function getTimestamp(value) {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

// Process each buyer
for (const buyerItem of buyers) {
  const buyer = buyerItem.json;

  const buyerMetros = toArray(buyer['Preferred Regions']);

  // Skip buyers without a valid record ID or metro preference
  if (!buyer.id || buyerMetros.length === 0) {
    continue;
  }

  const matchingDeals = [];
  const seenDealIds = new Set();

  // Find all available deals matching this buyer's metros
  for (const dealItem of deals) {
    const deal = dealItem.json;

    if (!deal.id || deal['Listing Status'] !== 'Available') {
      continue;
    }

    // Avoid duplicate property records
    if (seenDealIds.has(deal.id)) {
      continue;
    }

    const dealMetros = toArray(deal['Region IDs']);

    // Exact Airtable Region IDs ID matching
    const matchedMetroId = buyerMetros.find(
      metroId => dealMetros.includes(metroId)
    );

    if (!matchedMetroId) {
      continue;
    }

    seenDealIds.add(deal.id);

    matchingDeals.push({
      dealId: deal.id,
      city: deal.City || null,
      metro: deal['Region Name'] || [],
      matchedMetroId: matchedMetroId,

      dealSummary:
        deal['Listing Headline'] || null,

      marketingSnippet:
        deal['Listing Description'] || null,

      entryFee: deal['Participation Fee'] ?? null,

      priorityScore:
        Number(deal['Ranking Score']) || 0,

      addedDate:
        deal['Listing Added Date'] ||
        deal.createdTime ||
        null
    });
  }

  // Sort: highest priority score, then newest deal
  matchingDeals.sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) {
      return b.priorityScore - a.priorityScore;
    }

    return (
      getTimestamp(b.addedDate) -
      getTimestamp(a.addedDate)
    );
  });

  // Select a maximum of 3 deals
  const topDeals = matchingDeals
    .slice(0, 3)
    .map((deal, index) => ({
      rank: index + 1,
      ...deal
    }));

  // Only return buyers who have matching properties
  if (topDeals.length > 0) {
    results.push({
      json: {
        buyerId: buyer.id,
        buyerName: buyer['Contact Name'] || null,
        phone: buyer['Contact Number'] || null,

        totalMatchingDeals: matchingDeals.length,
        selectedDealCount: topDeals.length,

        topDeals: topDeals,

        // Preparation only; no call is initiated here
        outreachStatus: 'Pending Review'
      }
    });
  }
}

return results;
