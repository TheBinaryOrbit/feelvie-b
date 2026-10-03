import mongoose from 'mongoose';

const wholeNumber = (field) => ({
  validator: Number.isInteger,
  message: `${field} must be a whole number`,
});

const creditPackSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 1000 },
    credits: {
      type: Number,
      required: [true, 'Credits is required'],
      min: [1, 'Credits must be at least 1'],
      validate: wholeNumber('Credits'),
    },
    priceInr: {
      type: Number,
      required: [true, 'Price is required'],
      min: [1, 'Price must be at least 1'],
    },
    // Credits from each purchase expire this many days after the purchase.
    validityDays: {
      type: Number,
      required: [true, 'Validity in days is required'],
      min: [1, 'Validity must be at least 1 day'],
      max: [3650, 'Validity cannot be more than 3650 days'],
      validate: wholeNumber('Validity days'),
    },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true }
);

creditPackSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

export const CreditPack = mongoose.model('CreditPack', creditPackSchema);
