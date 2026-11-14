const getPincodeDetails = async (pincode) => {
  if (!/^[0-9]{6}$/.test(pincode)) {
    throw new Error("Pincode must contain 6 digits");
  }

  const response = await fetch(
    `https://api.postalpincode.in/pincode/${pincode}`,
    { signal: AbortSignal.timeout(5000) }
  );

  if (!response.ok) {
    throw new Error("Pincode service unavailable");
  }

  const data = await response.json();

  if (
    !Array.isArray(data) ||
    data[0]?.Status !== "Success" ||
    !Array.isArray(data[0]?.PostOffice) ||
    data[0].PostOffice.length === 0
  ) {
    return null;
  }

  return {
    state: data[0].PostOffice[0].State,
    district: data[0].PostOffice[0].District,
  };
};

module.exports = getPincodeDetails;