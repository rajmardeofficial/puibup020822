const mongoose = require("mongoose");
const { Types, Schema } = mongoose;

const UserSchema = new Schema({
  username: String,
  email: String,
  contactNumber: String,
  gender: String,
  birthday: String,
  aniversary: String,
  password: String,
  bio: String,
});

module.exports = mongoose.model('User', UserSchema)
