require("dotenv").config();
const express = require("express");
const Razorpay = require("razorpay");
const bodyparser = require("body-parser");
const request = require("request");
const https = require("https");
const ejs = require("ejs");
const path = require("path");
const xoauth2 = require("xoauth2");
const mongoose = require("mongoose");
const { Types } = mongoose;
const nodemailer = require("nodemailer");
const session = require("express-session");
const passport = require("passport");
const bcript = require("bcrypt");
const passportLocalMongoose = require("passport-local-mongoose");
const cryptoJs = require("crypto-js");
const crypto = require("crypto");
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
  if (req.session.username === undefined) {
    res.locals.username = "Guest";
    res.locals.isLoggedIn = false;
  } else {
    res.locals.username = req.session.username;
    res.locals.dp = req.session.dp;
    res.locals.email = req.session.email;
    res.locals.phone = req.session.phone;
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
  invites: [
    {
      user: { type: Types.ObjectId, ref: "clubUsers" },
    },
  ],
  subId: String,
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

const uniqueSchema = new mongoose.Schema({
  uniqueId: String,
  user: { type: Types.ObjectId, ref: "clubUsers" },
  ticketemail: String,
});

const planSchema = new mongoose.Schema({
  planId: String,
  amount: Number,
  name: String,
  desc: String,
});

userSchema.plugin(passportLocalMongoose);
const clubUsers = mongoose.model("clubUsers", userSchema);
const planInfo = mongoose.model("planInfo", planSchema);
const clubowner = mongoose.model("clubowner", clubdataSchema);
const uniqueId = mongoose.model("uniqueId", uniqueSchema);
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

app.get("/plans", (req, res) => {
  res.render("plans");
});

app.post("/plans", (req, res) => {
  const { planamt, period, interval, name, desc } = req.body;

  const opt = {
    period: period,
    interval: interval,
    item: {
      name: "Test plan",
      amount: planamt * 100,
      currency: "INR",
      description: "Description for test plan",
    },
  };

  // console.log(req.body);

  instance.plans.create(opt, (err, result) => {
    console.log(result);
    const data = new planInfo({
      planId: result.id,
      amount: result.item.amount / 100,
      name: name,
      desc: desc,
    });

    data.save((err, result) => {
      if (err) console.log(err);
    });
  });
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

//Razorpay Subscription

app.get("/subscription", (req, res) => {
  planInfo.find((err, result) => {
    // console.log(result);
    res.render("subscription", { data: result });
  });
});

app.post("/subscribe/:id", (req, res) => {
  const { id } = req.params;
  console.log(id);
  const opt = {
    plan_id: id,
    customer_notify: 1,
    quantity: 1,
    total_count: 1,
  };

  instance.subscriptions.create(opt, (err, result) => {
    res.send(result);
    console.log(result);
  });
});

app.get("/planCard/:id", (req, res) => {
  const { id } = req.params;
  planInfo.findById(id, (err, result) => {
    console.log(result);
    res.render("planCard", { data: result });
  });
});

// PDF KIT END

// uniqueId generation

app.get("/uni", (req, res) => {
  const uniqueNumber = Math.random().toString(36).substr(2, 9);
  console.log(uniqueNumber);
  req.session.uniqueNumber = uniqueNumber;

  const uniqueData = new uniqueId({
    uniqueId: uniqueNumber,
    user: req.session.userid,
    ticketemail: req.session.email,
  });
  if (req.session.userid) {
    console.log(req.session.userid);
    uniqueData.save((err, result) => {
      console.log(err);
    });
  } else {
    res.redirect("/");
  }
});

app.get("/clubAdmin", (req, res) => {
  res.render("clubAdmin");
});

app.post("/uni", (req, res) => {
  const uniqueRand = req.body.uniqueId;
  console.log(uniqueRand);
  uniqueId.find({ uniqueId: uniqueRand }, (err, result) => {
    console.log(result);
    req.session.ticketemail = result[0].ticketemail;
    // let transporter = nodemailer.createTransport({
    //   service: "gmail",
    //   auth: {
    //     user: "perseverancetechytl@gmail.com",
    //     pass: "pubup@160992",
    //   },
    // });
    let mailOptions = {
      from: "PUBUP",
      to: req.session.ticketemail,
      subject: "Hello this is test nodemailer email",
      text: `<h1> Welcome to PUBUP </h1>
        <p> Your unique code is: </p>
        <h1> ${result} </h1> 
      `,
    };
    nodemailer
      .createTransport({
        service: "Gmail",
        auth: {
          // xoauth2: xoauth2.createXOAuth2Generator({
          //   user: "perseverancetechytl@gmail.com",
          //   clientId:
          //     "815030353595-qtbg3q4pa5u2jm84uqmpi4pudj9qnq5s.apps.googleusercontent.com",
          //   clientSecret: "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",
          // }),

          user: "raj.webdevelopment.practice@gmail.com",
          pass: "hkjdyokvjqxdmwrk",
        },
        port: 465,
        host: "smtp.gmail.com",
      })
      .sendMail(mailOptions, (error, info) => {
        if (error) {
          console.log(error);
        } else {
          console.log(info);
        }
      });
  });
});

// uniqueId generation end

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

app.post("/successSubs", (req, res) => {
  console.log(req.body);
  let body =
    req.body.razorpay_payment_id + "|" + req.body.razorpay_subscription_id;
  let expectedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(body.toString())
    .digest("hex");
  console.log("sig received ", req.body.razorpay_signature);
  console.log("sig generated ", expectedSignature);
  if (expectedSignature == req.body.razorpay_signature) {
    response = { signatureIsValid: "true" };
    // console.log(req.body);

    // clubUsers.find({ _id: req.session.userid }, (err, result) => {
    //   if (!err) {
    //     console.log(result);
    //   } else {
    //     console.log(err);
    //   }
    // });

    clubUsers.findOneAndUpdate(
      { _id: req.session.userid },
      { $set: { subId: req.body.razorpay_subscription_id } },
      { new: true },
      (err, result) => {
        if (err) {
          console.log(err);
        } else {
          console.log(result);
        }
      }
    );
  }
});

//check subs status

app.get("/checkSubStat", (req, res) => {
  // clubUsers.findById(req.session.userid, (err, result) => {
  //   console.log(result);
  //   if (err) {
  //     res.send("Try Again", err);
  // } else {
  //   instance.subscriptions.fetch(result[0].subId, (err, result) => {

  // console.log(result);

  // if (result.status === "completed" || "active" || "authenticated") {
  //   console.log(result);
  //   res.send("accepted");
  // } else {
  //   res.redirect("/subscriptions");
  // }
  // });
  // }
  // });

  clubUsers.findById(req.session.userid, (err, result) => {
    if (err) {
      console.log(err);
    } else if (result.subId == null) {
      res.redirect("/subscription");
    } else {
      instance.subscriptions.fetch(result.subId, (err, doc) => {
        if (err) {
          console.log(err);
        } else {
          if (doc.status == "completed" || "active" || "authenticated") {
            res.send("Sub Active");
          } else {
            res.send("Sub inactive");
          }
        }
      });
    }
  });
});

//Razorpay logic ends here

// delete invite

app.get("/deleteInvite/:id", (req, res) => {
  const { id } = req.params;
});

// delete invites end

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
    res.render("login", { errors: [] });
  }
);

app.post("/", (req, res) => {
  const { username, password } = req.body;
  const errors = [];
  clubUsers.findOne({ username: username }, (err, results) => {
    if (err) {
      console.log(err);
    } else {
      if (results) {
        if (results.password === password) {
          req.session.username = results.username;
          req.session.userid = results._id;
          req.session.dp = results.image;
          req.session.email = results.email;
          req.session.phone = results.contactNumber;
          console.log(req.session);
          res.redirect("pop");
        } else {
          errors.push("Password does not match !");
          res.render("login", { errors: errors });
        }
      }
    }
  });
});

app.get("/register", function (req, res) {
  // console.log(req.session);
  res.render("register", { errors: [] });
});

app.post("/register", imageUpload.single("image"), (req, res) => {
  const { username, password, phone, date, email, anidate, bio, gender } =
    req.body;

  const errors = [];

  clubUsers.find({ email: email }, (err, result) => {
    if (result.length > 0) {
      errors.push("Email already exist");
      res.render("register", { errors: errors });
    } else {
      const image = req.file.filename;
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
          req.session.email = result.email;
          req.session.phone = result.contactNumber;
          console.log(req.session);
          res.redirect("/clubs");
        }
      });
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

//invites logic

app.get("/users/:id", (req, res) => {
  var likinguser = req.session.userid;
  console.log(likinguser);
  const id = req.params.id;
  console.log(id);

  clubUsers.findOne({ _id: id }).exec((err, results) => {
    results.invites.push({
      user: req.session.userid,
    });

    results.save((err, cb) => {
      if (err) {
        console.log(err);
      } else {
        console.log(cb);
        res.send("request sent success");
      }
    });
  });
});

app.get("/myinvites", (req, res) => {
  var myid = req.session.userid;
  console.log(myid);
  clubUsers
    .findById(myid)
    .populate("invites.user")
    .exec((err, result) => {
      console.log(result);
      res.render("myinvites", { result: result.invites });
    });
});

//invites logic ends

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
