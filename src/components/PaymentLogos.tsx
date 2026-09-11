import payStationBanner from "@/assets/payments/pay-station-banner.jpeg?w=800&format=webp";

const PaymentLogos = () => {
  return (
    <div className="flex justify-center">
      <img
        src={payStationBanner}
        alt="Payment methods - Visa, Mastercard, American Express, UnionPay, bKash, Nagad, Rocket, Upay and more"
        width={800}
        height={196}
        className="w-full max-w-2xl rounded-lg"
        loading="lazy"
      />
    </div>
  );
};

export default PaymentLogos;
