require("dotenv").config();
const express = require("express");
const Razorpay = require("razorpay");
const bodyparser = require("body-parser");
const request = require("request");
const https = require("https");
const ejs = require("ejs");
const path = require("path");
const mongoose = require("mongoose");
const { Types } = mongoose;
const nodemailer = require("nodemailer");
const session = require("express-session");
const passport = require("passport");
const bcript = require("bcrypt");
const passportLocalMongoose = require("passport-local-mongoose");
const cryptoJs = require("crypto-js");
const crypto = require('crypto')
const multer = require("multer");
const PDFDocument = require("pdfkit");
const { log } = require("console");

const app = express();
app.use(
  session({
    secret: "keyboard cat",
    resave: false,
    saveUninitialized: false,
  })
);
app.set("view engine", "ejs");
app.use(express.static(__dirname + "/public/"));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const keyId = process.env.KEY_ID;
const keySecret = process.env.KEY_SECRET;

app.use((req, res, next) => {
  console.log(req.session);

  if (req.session.username === undefined) {
    res.locals.username = "Guest";
    res.locals.isLoggedIn = false;
  } else {
    res.locals.username = req.session.username;
    res.locals.dp = req.session.dp;
    res.locals.isLoggedIn = true;
  }
  next();
});

// mongodb connection url
mongoose.connect("mongodb://localhost:27017/clubs", {
  useNewUrlParser: true,
});

const imageStorage = multer.diskStorage({
  // Destination to store image
  destination: "public/dp",
  filename: (req, file, cb) => {
    cb(
      null,
      file.fieldname + "_" + Date.now() + path.extname(file.originalname)
    );
    // file.fieldname is name of the field (image)
    // path.extname get the uploaded file extension
  },
});

const imageUpload = multer({
  storage: imageStorage,
  limits: {
    fileSize: 1000000, // 1000000 Bytes = 1 MB
  },
  fileFilter(req, file, cb) {
    console.log(file);
    if (!file.originalname.match(/\.(png|jpg|HEIC|jpeg|AVIF)$/)) {
      // upload only png and jpg format
      return cb(new Error("Please upload a Image"));
    }
    cb(undefined, true);
  },
});

const userSchema = new mongoose.Schema({
  username: String,
  email: String,
  contactNumber: String,
  gender: String,
  birthday: String,
  aniversary: String,
  password: String,
  bio: String,
  image: String,
});

const clubdataSchema = new mongoose.Schema({
  user: { type: Types.ObjectId, ref: "clubUsers" },
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
      user: { type: Types.ObjectId, ref: "clubUsers" },
    },
  ],
});

userSchema.plugin(passportLocalMongoose);
const clubUsers = mongoose.model("clubUsers", userSchema);
const clubowner = mongoose.model("clubowner", clubdataSchema);
passport.use(clubUsers.createStrategy());
passport.serializeUser(function (user, done) {
  done(null, user);
});
passport.deserializeUser(function (user, done) {
  done(null, user);
});

//razorpay logic goes here
let instance = new Razorpay({
  key_id: "rzp_test_zdzlPwPUae1Qzv",
  key_secret: "RbJB4zzx59CY7jM0OEpNtzpM",
});

app.post("/createOrder/:id", (req, res) => {
  // const { amount, currency } = req.body;
  const id = req.params.id;
  // console.log(id);
  clubowner.findById(id, (err, result) => {
    if (!err) {
      // res.render("info", {
      //   data: result,
      // });
      let options = {
        amount: result.discount * 100, // amount in the smallest currency unit
        currency: "INR",
      };
      // console.log(amount, currency);
      instance.orders.create(options, function (err, order) {
        res.send(order);
        console.log(order);
      });
    } else {
      console.log(err);
    }
  });
});

// PDF KIT

app.get("/invoice", checkName, (req, res) => {
  const doc = new PDFDocument({
    bufferPages: true,
    font: "Courier",
    layout: "landscape",
    size: "A4",
  });

  function buildPDF(datacallback, endcallback) {
    doc.on("data", datacallback);
    doc.on("end", endcallback);

    doc
      .image("ticket/invoice.jpg", 0, 0, { width: 850 })
      .rect(0, 0, 850, 850)
      .stroke()
      .fontSize(25)
      .text(`${req.session.username}`, 70, 200)
      .fillColor("white");
    doc.end();
  }
  const stream = res.writeHead(200, {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment;filename=invoice.pdf`,
  });

  buildPDF(
    (chunk) => stream.write(chunk),
    () => stream.end()
  );
});

function checkName(req, res, next) {
  if (req.session.username) {
    next();
  } else {
    res.send("oops bocha fatla");
  }
}

// PDF KIT END

app.get("/pop", (req, res) => { 
  res.render("popup");
});

app.post("/success", (req, res) => {
  // console.log(req.body);
  let body = req.body.razorpay_order_id + "|" + req.body.razorpay_payment_id;
  let expectedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(body.toString())
    .digest("hex");
  console.log("sig received ", req.body.razorpay_signature);
  console.log("sig generated ", expectedSignature);
  if (expectedSignature === req.body.razorpay_signature) {
    response = { signatureIsValid: "true" };
    res.redirect("/invoice");
  }
});

//Razorpay logic ends here

app.get(
  "/",

  (req, res, next) => {
    if (req.session.username) {
      res.redirect("/clubs");
    } else {
      next();
    }
  },

  (req, res) => {
    res.render("login");
  }
);

app.post("/", (req, res) => {
  const { username, password } = req.body;
  clubUsers.findOne({ username: username }, (err, results) => {
    if (err) {
      console.log(err);
    } else {
      if (results) {
        if (results.password === password) {
          req.session.username = results.username;
          req.session.userid = results._id;
          req.session.dp = results.image;
          res.redirect("pop");
        }
      }
    }
  });
});

app.get("/register", function (req, res) {
  // console.log(req.session);
  res.render("register");
});

app.post("/register", imageUpload.single("image"), (req, res) => {
  const { username, password, phone, date, email, anidate, bio, gender } =
    req.body;

  const image = req.file.filename;

  console.log(image);

  const data = new clubUsers({
    username: username,
    password: password,
    contactNumber: phone,
    birthday: date,
    email: email,
    aniversary: anidate,
    bio: bio,
    gender: gender,
    image: image,
  });
  data.save((err, result) => {
    if (err) {
      console.log(err);
    } else {
      req.session.username = result.username;
      req.session.userid = result._id;
      req.session.dp = result.image;
      res.redirect("/clubs");
    }
  });
});

app.get("/info/:id", function (req, res) {
  const id = req.params.id;
  clubowner.findById(id, (err, result) => {
    if (!err) {
      res.render("info", {
        data: result,
      });
      // console.log(result);
    } else {
      console.log("something went wrong data was not fetched");
    }
  });
});

//users card

app.get("/card/:id", (req, res) => {
  const { id } = req.params;

  // clubowner.findById(id, (err, result) => {
  //   if (!err) {
  //     res.render("card", {
  //      data: result,
  //    });
  //     console.log(result);
  //   } else {
  //     console.log("something went wrong data was not fetched");
  //   }
  // });

  clubowner
    .findById(id)
    .populate("likes.user")
    .exec((err, results) => {
      console.log(results.likes[0].user);
      res.render("card", { data: results.likes });
    });
});
 
app.get("/clubs", function (req, res) {
  clubowner.find((err, result) => {
    if (!err) {
      res.render("clubs", {
        data: result,
      });

    } else {
      console.log("something went wrong data was not fetched");
    }
  });
});

//like logic
app.post("/like/:id", (req, res) => {
  const { id } = req.params;
  clubowner.findOne({ _id: id }).exec((err, results) => {
    // const tempLikes = results.likes.filter((item) => {
    //   item.user == req.session.userid;
    //   if (tempLikes.length == 0) {
    //     results.likes.push({
    //       user: req.session.userid,
    //     });
    //   } else {
    //     results.likes = results.likes.filter(
    //       (item) => item.user != req.session.userid
    //     );
    //   }

    //   results.save((err, results) => {
    //     if (err) {
    //       res.send(err);
    //     } else {
    //       res.send("liked");
    //     }
    //   });
    // });

    // console.log(results);
    results.likes.push({
      user: req.session.userid,
    });

    results.save((err, cb) => {
      if (err) {
        console.log(err);
      } else {
        console.log(cb);
        res.redirect("/clubs");
      }
    });
  });
});
//like logic ends

app.get("/clubowners", function (req, res) {
  res.render("clubowners");
});

app.post("/clubowners", function (req, res) {
  const clubname = req.body.clubname;
  const email = req.body.email;
  const contactnumber = req.body.contactnumber;
  const disc = req.body.disc;
  const tagofevent = req.body.tagofevent;
  const venue = req.body.venue;
  const entryfees = req.body.entryfees;
  const theme = req.body.theme;
  const dj = req.body.dj;
  const address = req.body.address;
  const discountpercent = req.body.discountpercent;

  const discount = entryfees - (entryfees * discountpercent) / 100;

  const data = new clubowner({
    clubname: clubname,
    email: email,
    contactnumber: contactnumber,
    disc: disc,
    tagofevent: tagofevent,
    venue: venue,
    entryfees: entryfees,
    theme: theme,
    dj: dj,
    address: address,
    discount: discount,
  });
  data.save();

  res.redirect("/clubowners");
});

//logout

app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      res.redirect("/");
    } else {
      res.redirect("/");
    }
  });
});

app.listen(process.env.PORT || 2022, function () {
  console.log("server is running successfully on port made by om kadam");
});
