let userController = require('../controllers/users')
let jwt = require('jsonwebtoken')
let fs = require('fs')
let path = require('path')

const PUBLIC_KEY = fs.readFileSync(
    path.join(__dirname, '..', 'keys', 'public.pem'),
    'utf8'
)
module.exports = {
    CheckLogin: async function (req, res, next) {
        try {
            let token;
            if (req.cookies.TOKEN_NNPTUD_C3) {
                token = req.cookies.TOKEN_NNPTUD_C3
            } else {
                token = req.headers.authorization;
                if (!token || !token.startsWith("Bearer")) {
                    res.status(403).send({ message: "ban chua dang nhap" })
                    return;
                }
                token = token.split(' ')[1]
            }
            let result = jwt.verify(token, PUBLIC_KEY, {
                algorithms: ['RS256']
            });
            if (result.exp * 1000 < Date.now()) {
                res.status(403).send({ message: "ban chua dang nhap" })
                return;
            }
            let getUser = await userController.GetUserById(result.id);
            if (!getUser) {
                res.status(403).send({ message: "ban chua dang nhap" })
            } else {
                req.user = getUser;
                next();
            }
        } catch (error) {
            res.status(403).send({ message: "ban chua dang nhap" })
        }

    }
}
