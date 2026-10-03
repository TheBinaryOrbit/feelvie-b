const daysInMonthUTC = (year, month) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

// Adds calendar months in UTC, clamping the day: 31 Jan + 1 month = 28/29 Feb, not 3 Mar.
export const addMonthsUTC = (date, months) => {
  const d = new Date(date);
  const day = d.getUTCDate();
  const target = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds())
  );
  target.setUTCDate(Math.min(day, daysInMonthUTC(target.getUTCFullYear(), target.getUTCMonth())));
  return target;
};

export const addDays = (date, days) => new Date(new Date(date).getTime() + days * 24 * 60 * 60 * 1000);

// Razorpay timestamps are Unix seconds.
export const fromUnix = (seconds) => (seconds ? new Date(seconds * 1000) : undefined);

export const formatDay = (date) =>
  new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
