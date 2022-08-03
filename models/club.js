const mongoose = require("mongoose");
const { Types, Schema } = mongoose;

const ClubSchema = new Schema({
    clubname: String,
    email: String,
    contactnumber: String,
    disc: String,
    tagofevent: String,
    venue: String,
    entryfees: String,
    theme: String,
    dj: String,
    address: String,
    discount: String,
    likes: [
      {
        user: { type: Types.ObjectId, ref: 'User' },
      },
    ],
});

module.exports = mongoose.model('Club', ClubSchema)
